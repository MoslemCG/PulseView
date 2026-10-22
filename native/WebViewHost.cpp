#include "WebViewHost.h"
#include <windowsx.h>
#include <algorithm>
#include <memory>

namespace pulse {
using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;
namespace {
constexpr auto origin=L"https://app.pulseview.local/";
struct CoString {LPWSTR p=nullptr;~CoString(){CoTaskMemFree(p);}LPWSTR* out(){return &p;}std::wstring value()const{return p?p:L"";}};
bool Allowed(const std::wstring& uri){return uri.rfind(origin,0)==0;}
}
void WebViewHost::Defer(std::function<void()> action){if(closing_)return;deferred_.push_back(std::move(action));PostMessageW(hwnd_,DeferredMessage,0,0);}
void WebViewHost::PumpDeferred(){if(closing_||deferred_.empty())return;auto action=std::move(deferred_.front());deferred_.pop_front();try{action();}catch(const std::exception&e){Fail(e.what());}}
void WebViewHost::Fail(const std::string& s)noexcept{Log(s);try{Defer([this,s]{if(onFailure_&&!closing_)onFailure_(s);});}catch(...) {}}
void WebViewHost::Initialize(HWND h,const std::filesystem::path& data,MessageHandler message,FailureHandler failure){
 hwnd_=h;onMessage_=std::move(message);onFailure_=std::move(failure);
 Check(DCompositionCreateDevice(nullptr,IID_PPV_ARGS(&device_)),"Create DirectComposition device");
 const HRESULT hr=CreateCoreWebView2EnvironmentWithOptions(nullptr,data.c_str(),nullptr,
  Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>([this](HRESULT result,ICoreWebView2Environment* env)->HRESULT{
   if(closing_)return S_OK;
   try{
    Check(result,"WebView2 Runtime creation. Install the Evergreen x64 Runtime if it is missing");
    if(!env)throw std::runtime_error("WebView2 returned no environment.");
    environment_=env;CoString version;if(SUCCEEDED(env->get_BrowserVersionString(version.out())))runtime_=Utf8(version.value());
    ComPtr<ICoreWebView2Environment3> e3;Check(environment_.As(&e3),"WebView2 composition support");
    Check(e3->CreateCoreWebView2CompositionController(hwnd_,
     Callback<ICoreWebView2CreateCoreWebView2CompositionControllerCompletedHandler>([this](HRESULT r,ICoreWebView2CompositionController* c)->HRESULT{
      if(closing_)return S_OK;try{Check(r,"Create WebView2 composition controller");if(!c)throw std::runtime_error("Missing composition controller.");Attach(c);}catch(const std::exception&e){Fail(e.what());}return S_OK;
     }).Get()),"Request WebView2 composition controller");
   }catch(const std::exception&e){Fail(e.what());}return S_OK;
  }).Get());
 Check(hr,"Start WebView2. Install the Microsoft Edge WebView2 Evergreen x64 Runtime");
}
void WebViewHost::Attach(ICoreWebView2CompositionController*c){
 composition_=c;Check(composition_.As(&controller_),"Query WebView2 controller");
 Check(controller_->get_CoreWebView2(&webview_),"Query WebView2 core");
 Check(device_->CreateTargetForHwnd(hwnd_,TRUE,&target_),"Create composition window target");
 Check(device_->CreateVisual(&root_),"Create composition root");
 Check(device_->CreateVisual(&webVisual_),"Create composition web visual");
 Check(device_->CreateEffectGroup(&effect_),"Create opacity effect");
 Check(effect_->SetOpacity(static_cast<float>(opacity_)),"Set opacity");
 Check(root_->SetEffect(effect_.Get()),"Attach opacity effect");
 Check(root_->AddVisual(webVisual_.Get(),TRUE,nullptr),"Attach web visual");
 Check(target_->SetRoot(root_.Get()),"Attach composition tree");
 Check(composition_->put_RootVisualTarget(webVisual_.Get()),"Attach WebView2 visual");
 Check(device_->Commit(),"Commit composition tree");
 ComPtr<ICoreWebView2Controller2> c2;if(SUCCEEDED(controller_.As(&c2)))c2->put_DefaultBackgroundColor({0,0,0,0});
 ComPtr<ICoreWebView2Controller3> c3;if(SUCCEEDED(controller_.As(&c3))){c3->put_ShouldDetectMonitorScaleChanges(TRUE);}
 Secure();Resize();controller_->put_IsVisible(TRUE);
 ComPtr<ICoreWebView2_3> local;Check(webview_.As(&local),"WebView2 virtual host support");
 const auto folder=ExecutableDirectory()/L"ui";
 if(!std::filesystem::exists(folder/L"index.html"))throw std::runtime_error("UI assets are missing. Keep the complete ui folder beside PulseView.exe.");
 Check(local->SetVirtualHostNameToFolderMapping(L"app.pulseview.local",folder.c_str(),COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_DENY_CORS),"Map local UI assets");
 Check(webview_->Navigate(L"https://app.pulseview.local/index.html"),"Load local UI");
}
void WebViewHost::Secure(){
 ComPtr<ICoreWebView2Settings>s;Check(webview_->get_Settings(&s),"Get WebView2 settings");
 s->put_AreDefaultContextMenusEnabled(FALSE);s->put_IsStatusBarEnabled(FALSE);s->put_IsZoomControlEnabled(FALSE);
 s->put_AreHostObjectsAllowed(FALSE);s->put_IsWebMessageEnabled(TRUE);s->put_AreDefaultScriptDialogsEnabled(FALSE);
#ifdef _DEBUG
 s->put_AreDevToolsEnabled(TRUE);
#else
 s->put_AreDevToolsEnabled(FALSE);
#endif
 ComPtr<ICoreWebView2Settings3>s3;if(SUCCEEDED(s.As(&s3)))s3->put_AreBrowserAcceleratorKeysEnabled(FALSE);
 EventRegistrationToken token{};
 Check(webview_->add_NavigationStarting(Callback<ICoreWebView2NavigationStartingEventHandler>([](ICoreWebView2*,ICoreWebView2NavigationStartingEventArgs*a)->HRESULT{CoString uri;a->get_Uri(uri.out());if(!Allowed(uri.value()))a->put_Cancel(TRUE);return S_OK;}).Get(),&token),"Navigation guard");
 Check(webview_->add_NewWindowRequested(Callback<ICoreWebView2NewWindowRequestedEventHandler>([](ICoreWebView2*,ICoreWebView2NewWindowRequestedEventArgs*a)->HRESULT{a->put_Handled(TRUE);return S_OK;}).Get(),&token),"Popup guard");
 Check(webview_->add_PermissionRequested(Callback<ICoreWebView2PermissionRequestedEventHandler>([](ICoreWebView2*,ICoreWebView2PermissionRequestedEventArgs*a)->HRESULT{a->put_State(COREWEBVIEW2_PERMISSION_STATE_DENY);return S_OK;}).Get(),&token),"Permission guard");
 ComPtr<ICoreWebView2_4>w4;if(SUCCEEDED(webview_.As(&w4)))w4->add_DownloadStarting(Callback<ICoreWebView2DownloadStartingEventHandler>([](ICoreWebView2*,ICoreWebView2DownloadStartingEventArgs*a)->HRESULT{a->put_Cancel(TRUE);return S_OK;}).Get(),&token);
 Check(webview_->add_WebMessageReceived(Callback<ICoreWebView2WebMessageReceivedEventHandler>([this](ICoreWebView2*,ICoreWebView2WebMessageReceivedEventArgs*a)->HRESULT{
  try{CoString source,raw;a->get_Source(source.out());if(!Allowed(source.value())||closing_)return S_OK;Check(a->get_WebMessageAsJson(raw.out()),"Read UI message");auto text=Utf8(raw.value());if(text.size()>4*1024*1024)throw std::runtime_error("UI message exceeds 4 MiB.");auto j=Json::parse(text);Defer([this,j=std::move(j)]{if(onMessage_&&!closing_)onMessage_(j);});}catch(const std::exception&e){Log(std::string("UI message rejected: ")+e.what());}return S_OK;
 }).Get(),&token),"Attach JSON bridge");
 // Native confirmations preserve the UI's explicit destructive-action prompts,
 // without exposing generic browser dialogs or allowing navigation to websites.
 Check(webview_->add_ScriptDialogOpening(Callback<ICoreWebView2ScriptDialogOpeningEventHandler>([this](ICoreWebView2*,ICoreWebView2ScriptDialogOpeningEventArgs*a)->HRESULT{
  CoString uri,text;a->get_Uri(uri.out());if(!Allowed(uri.value()))return S_OK;a->get_Message(text.out());COREWEBVIEW2_SCRIPT_DIALOG_KIND kind{};a->get_Kind(&kind);
  ComPtr<ICoreWebView2Deferral> deferral;const auto hr=a->GetDeferral(&deferral);if(FAILED(hr))return hr;
  ComPtr<ICoreWebView2ScriptDialogOpeningEventArgs> args=a;const auto message=text.value();
  // A modal dialog must not start a nested message loop inside a WebView callback.
  // Retain the event arguments and complete its deferral after a posted UI task.
  Defer([this,args,deferral,message,kind]{
   if(kind==COREWEBVIEW2_SCRIPT_DIALOG_KIND_ALERT){MessageBoxW(hwnd_,message.c_str(),L"PulseView",MB_OK|MB_ICONINFORMATION);args->Accept();}
   else if(kind==COREWEBVIEW2_SCRIPT_DIALOG_KIND_CONFIRM&&MessageBoxW(hwnd_,message.c_str(),L"PulseView",MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2)==IDYES)args->Accept();
   deferral->Complete();
  });return S_OK;
 }).Get(),&token),"Attach application confirmations");
 composition_->add_CursorChanged(Callback<ICoreWebView2CursorChangedEventHandler>([this](ICoreWebView2CompositionController*,IUnknown*)->HRESULT{Cursor();return S_OK;}).Get(),&token);
 webview_->add_ProcessFailed(Callback<ICoreWebView2ProcessFailedEventHandler>([this](ICoreWebView2*,ICoreWebView2ProcessFailedEventArgs*)->HRESULT{Fail("A WebView2 process failed. Close and restart PulseView. Saved presets remain on disk; inspect pulseview.log for collector errors.");return S_OK;}).Get(),&token);
}
void WebViewHost::Close(){
 if(closing_)return;closing_=true;onMessage_=nullptr;onFailure_=nullptr;deferred_.clear();
 if(composition_)composition_->put_RootVisualTarget(nullptr);
 if(controller_)controller_->Close();webview_.Reset();composition_.Reset();controller_.Reset();
 effect_.Reset();webVisual_.Reset();root_.Reset();target_.Reset();device_.Reset();environment_.Reset();
}
void WebViewHost::Resize(){if(controller_&&hwnd_){RECT r{};GetClientRect(hwnd_,&r);controller_->put_Bounds(r);controller_->NotifyParentWindowPositionChanged();}}
void WebViewHost::ParentMoved(){if(controller_)controller_->NotifyParentWindowPositionChanged();}
void WebViewHost::Focus(){if(controller_)controller_->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);}
void WebViewHost::Visible(bool v){if(controller_)controller_->put_IsVisible(v?TRUE:FALSE);}
void WebViewHost::Opacity(double v){opacity_=std::clamp(v,.25,1.0);if(effect_){Check(effect_->SetOpacity(static_cast<float>(opacity_)),"Change opacity");Check(device_->Commit(),"Commit opacity");}}
void WebViewHost::Post(const Json&m){if(webview_&&!closing_){const auto text=Wide(m.dump());const auto hr=webview_->PostWebMessageAsJson(text.c_str());if(FAILED(hr))Log("PostWebMessage: "+HResultText(hr));}}
bool WebViewHost::Cursor(){if(!composition_)return false;HCURSOR cursor=nullptr;if(SUCCEEDED(composition_->get_Cursor(&cursor))){SetCursor(cursor);return true;}return false;}
bool WebViewHost::Mouse(UINT msg,WPARAM wp,LPARAM lp){
 if(!composition_||!controller_)return false;
 if(!(msg>=WM_MOUSEFIRST&&msg<=WM_MOUSELAST)&&msg!=WM_MOUSELEAVE)return false;
 POINT p={GET_X_LPARAM(lp),GET_Y_LPARAM(lp)};UINT32 data=0;
 if(msg==WM_MOUSEWHEEL||msg==WM_MOUSEHWHEEL){ScreenToClient(hwnd_,&p);data=static_cast<UINT32>(GET_WHEEL_DELTA_WPARAM(wp));}
 if(msg==WM_XBUTTONDOWN||msg==WM_XBUTTONUP||msg==WM_XBUTTONDBLCLK)data=GET_XBUTTON_WPARAM(wp);
 if(msg==WM_MOUSEMOVE&&!tracking_){TRACKMOUSEEVENT t={sizeof(t),TME_LEAVE,hwnd_,0};TrackMouseEvent(&t);tracking_=true;}
 if(msg==WM_MOUSELEAVE){p={0,0};wp=0;data=0;tracking_=false;}
 if(msg==WM_LBUTTONDOWN||msg==WM_RBUTTONDOWN||msg==WM_MBUTTONDOWN||msg==WM_XBUTTONDOWN){SetCapture(hwnd_);Focus();}
 const auto hr=composition_->SendMouseInput(static_cast<COREWEBVIEW2_MOUSE_EVENT_KIND>(msg),static_cast<COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS>(GET_KEYSTATE_WPARAM(wp)),data,p);
 if(msg==WM_LBUTTONUP||msg==WM_RBUTTONUP||msg==WM_MBUTTONUP||msg==WM_XBUTTONUP){if(GetCapture()==hwnd_)ReleaseCapture();}
 return SUCCEEDED(hr);
}
}
