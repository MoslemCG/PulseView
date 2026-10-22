#include "Application.h"
#include <windowsx.h>
#include <dwmapi.h>
#include <shobjidl.h>
#include <wrl.h>
#include <algorithm>
#include <cmath>
#include <cwchar>

namespace pulse {
using Microsoft::WRL::ComPtr;
namespace {
constexpr UINT WM_PACKET=WM_APP+1,WM_TRAY=WM_APP+2,WM_DRAG=WM_APP+3;
constexpr int HOTKEY_RECOVER=100,HOTKEY_PRESET=200;
constexpr UINT_PTR TIMER_CLOSE=1,TIMER_WINDOW=2;
constexpr auto className=L"PulseView.MainWindow.1";
int Pixel(double dip,UINT dpi){return static_cast<int>(std::lround(dip*dpi/96.0));}
double Dip(LONG pixel,UINT dpi){return std::round(pixel*96.0/dpi);}
double Number(const Json&o,const char*k,double fallback,double lo,double hi){if(!o.contains(k)||!o[k].is_number())return fallback;const double n=o[k].get<double>();return std::isfinite(n)?std::clamp(n,lo,hi):fallback;}
struct MonitorSearch {std::wstring name;HMONITOR found=nullptr;};
BOOL CALLBACK FindMonitor(HMONITOR monitor,HDC,LPRECT,LPARAM lp){auto*s=reinterpret_cast<MonitorSearch*>(lp);MONITORINFOEXW info{};info.cbSize=sizeof(info);if(GetMonitorInfoW(monitor,reinterpret_cast<MONITORINFO*>(&info))&&s->name==info.szDevice){s->found=monitor;return FALSE;}return TRUE;}
}
Application::Application(bool safe):telemetry_([this](Json p){QueueTelemetry(std::move(p));}),safeMode_(safe){session_=storage_.Session();}
Application::~Application(){telemetry_.Stop();web_.Close();if(hwnd_){UnregisterHotKey(hwnd_,HOTKEY_RECOVER);for(int i=0;i<9;++i)UnregisterHotKey(hwnd_,HOTKEY_PRESET+i);if(tray_){NOTIFYICONDATAW n{};n.cbSize=sizeof(n);n.hWnd=hwnd_;n.uID=1;Shell_NotifyIconW(NIM_DELETE,&n);}}}
int Application::Run(HINSTANCE instance,int show){
 instance_=instance;
 WNDCLASSEXW wc{};wc.cbSize=sizeof(wc);wc.style=CS_DBLCLKS;wc.lpfnWndProc=Procedure;wc.hInstance=instance;wc.hCursor=LoadCursorW(nullptr,IDC_ARROW);wc.hIcon=LoadIconW(instance,MAKEINTRESOURCEW(101));wc.hIconSm=wc.hIcon;wc.lpszClassName=className;
 if(!RegisterClassExW(&wc)&&GetLastError()!=ERROR_CLASS_ALREADY_EXISTS)throw std::runtime_error("Cannot register the main window.");
 hwnd_=CreateWindowExW(WS_EX_APPWINDOW|WS_EX_NOREDIRECTIONBITMAP,className,L"PulseView",WS_OVERLAPPEDWINDOW,100,100,440,310,nullptr,nullptr,instance,this);
 if(!hwnd_)throw std::runtime_error("Cannot create the main window.");
 BOOL dark=TRUE;DwmSetWindowAttribute(hwnd_,DWMWA_USE_IMMERSIVE_DARK_MODE,&dark,sizeof(dark));
 const DWM_WINDOW_CORNER_PREFERENCE corner=DWMWCP_ROUND;DwmSetWindowAttribute(hwnd_,DWMWA_WINDOW_CORNER_PREFERENCE,&corner,sizeof(corner));
 taskbarCreated_=RegisterWindowMessageW(L"TaskbarCreated");tray_=CreateTray();
 recovery_=RegisterHotKey(hwnd_,HOTKEY_RECOVER,MOD_CONTROL|MOD_ALT|MOD_SHIFT|MOD_NOREPEAT,VK_F11)!=FALSE;
 for(int i=0;i<9;++i)presetKeys_[i]=RegisterHotKey(hwnd_,HOTKEY_PRESET+i,MOD_CONTROL|MOD_ALT|MOD_SHIFT|MOD_NOREPEAT,static_cast<UINT>('1'+i))!=FALSE;
 if(safeMode_&&!session_.is_null()){session_["settings"]=CleanSettings(Json::object());session_.erase("window");}
 if(!session_.is_null()&&session_.contains("window")&&!safeMode_)ApplyWindow(session_["window"]);
 ShowWindow(hwnd_,show==SW_HIDE?SW_SHOWNORMAL:show);UpdateWindow(hwnd_);
 web_.Initialize(hwnd_,storage_.Root()/L"WebView2",[this](const Json&j){OnMessage(j);},[this](const std::string&e){MessageBoxW(hwnd_,Wide(e).c_str(),L"PulseView — startup/runtime problem",MB_ICONERROR|MB_OK);});
 MSG msg{};int r;while((r=static_cast<int>(GetMessageW(&msg,nullptr,0,0)))>0){TranslateMessage(&msg);DispatchMessageW(&msg);}return r==-1?1:static_cast<int>(msg.wParam);
}
LRESULT CALLBACK Application::Procedure(HWND h,UINT m,WPARAM w,LPARAM l){
 auto*self=reinterpret_cast<Application*>(GetWindowLongPtrW(h,GWLP_USERDATA));
 if(m==WM_NCCREATE){self=static_cast<Application*>(reinterpret_cast<CREATESTRUCTW*>(l)->lpCreateParams);self->hwnd_=h;SetWindowLongPtrW(h,GWLP_USERDATA,reinterpret_cast<LONG_PTR>(self));}
 if(self){try{return self->Handle(m,w,l);}catch(const std::exception&e){Log(std::string("Window message: ")+e.what());if(m!=WM_PAINT)self->Event("notice",{{"message",e.what()},{"error",true}});return 0;}}
 return DefWindowProcW(h,m,w,l);
}
LRESULT Application::Handle(UINT m,WPARAM w,LPARAM l){
 if(m==taskbarCreated_&&taskbarCreated_){tray_=CreateTray();if(!tray_&&settings_.value("clickThrough",false))Recover();return 0;}
 switch(m){
 case WM_NCCALCSIZE:if(w)return 0;break;
 case WM_NCHITTEST:{
  if(settings_.value("clickThrough",false))return HTTRANSPARENT;
  if(IsZoomed(hwnd_))return HTCLIENT;
  RECT r{};GetWindowRect(hwnd_,&r);const int b=std::max(5,Pixel(5,GetDpiForWindow(hwnd_))),x=GET_X_LPARAM(l),y=GET_Y_LPARAM(l);
  const bool left=x<r.left+b,right=x>=r.right-b,top=y<r.top+b,bottom=y>=r.bottom-b;
  if(top&&left)return HTTOPLEFT;if(top&&right)return HTTOPRIGHT;if(bottom&&left)return HTBOTTOMLEFT;if(bottom&&right)return HTBOTTOMRIGHT;
  if(left)return HTLEFT;if(right)return HTRIGHT;if(top)return HTTOP;if(bottom)return HTBOTTOM;return HTCLIENT;
 }
 case WM_GETMINMAXINFO:{auto*mm=reinterpret_cast<MINMAXINFO*>(l);MONITORINFO mi{sizeof(mi)};GetMonitorInfoW(MonitorFromWindow(hwnd_,MONITOR_DEFAULTTONEAREST),&mi);const UINT dpi=GetDpiForWindow(hwnd_)?GetDpiForWindow(hwnd_):96;
  const LONG width=mi.rcWork.right-mi.rcWork.left,height=mi.rcWork.bottom-mi.rcWork.top;
  mm->ptMinTrackSize={std::min<LONG>(Pixel(minimumWidth_,dpi),width),std::min<LONG>(Pixel(minimumHeight_,dpi),height)};
  mm->ptMaxPosition={mi.rcWork.left-mi.rcMonitor.left,mi.rcWork.top-mi.rcMonitor.top};mm->ptMaxSize={width,height};return 0;}
 case WM_DPICHANGED:{const auto*r=reinterpret_cast<RECT*>(l);SetWindowPos(hwnd_,nullptr,r->left,r->top,r->right-r->left,r->bottom-r->top,SWP_NOZORDER|SWP_NOACTIVATE);web_.Resize();return 0;}
 case WM_SIZE:web_.Resize();web_.Visible(w!=SIZE_MINIMIZED&&IsWindowVisible(hwnd_));if(w==SIZE_MINIMIZED&&settings_.value("minimizeToTray",false)&&tray_)ShowWindow(hwnd_,SW_HIDE);CaptureNormal();SyncPause();SetTimer(hwnd_,TIMER_WINDOW,180,nullptr);return 0;
 case WM_MOVE:CaptureNormal();web_.ParentMoved();SetTimer(hwnd_,TIMER_WINDOW,180,nullptr);return 0;
 case WM_SETFOCUS:web_.Focus();return 0;
 case WM_SETCURSOR:if(LOWORD(l)==HTCLIENT&&web_.Cursor())return TRUE;break;
 case WM_ERASEBKGND:return 1;
 case WM_PAINT:{PAINTSTRUCT ps{};BeginPaint(hwnd_,&ps);EndPaint(hwnd_,&ps);return 0;}
 case WM_CLOSE:Exit(false);return 0;
 case WM_QUERYENDSESSION:Event("saveRequested");return TRUE;
 case WM_ENDSESSION:if(w&&!session_.is_null()){session_["window"]=WindowState();session_["settings"]=settings_;storage_.SaveSession(session_);}return 0;
 case WM_TIMER:if(w==TIMER_WINDOW){KillTimer(hwnd_,TIMER_WINDOW);Event("windowChanged");}else if(w==TIMER_CLOSE){KillTimer(hwnd_,TIMER_CLOSE);if(!session_.is_null()){session_["window"]=WindowState();session_["settings"]=settings_;storage_.SaveSession(session_);}telemetry_.Stop();web_.Close();DestroyWindow(hwnd_);}return 0;
 case WM_DESTROY:PostQuitMessage(0);return 0;
 case WM_PACKET:DeliverTelemetry();return 0;
 case WebViewHost::DeferredMessage:web_.PumpDeferred();return 0;
 case WM_DRAG:{
  // Anchor the move loop at the real cursor; (0,0) lies outside the window and cancels it.
  if(!(GetAsyncKeyState(GetSystemMetrics(SM_SWAPBUTTON)?VK_RBUTTON:VK_LBUTTON)&0x8000))return 0;
  POINT p{};GetCursorPos(&p);ReleaseCapture();SendMessageW(hwnd_,WM_NCLBUTTONDOWN,HTCAPTION,MAKELPARAM(p.x,p.y));
  // The modal move loop swallowed the button-up; end the press inside the WebView too.
  GetCursorPos(&p);ScreenToClient(hwnd_,&p);web_.Mouse(WM_LBUTTONUP,0,MAKELPARAM(p.x,p.y));return 0;}
 case WM_TRAY:if(LOWORD(l)==WM_RBUTTONUP||LOWORD(l)==WM_CONTEXTMENU)TrayMenu();else if(LOWORD(l)==WM_LBUTTONUP||LOWORD(l)==NIN_SELECT||LOWORD(l)==NIN_KEYSELECT)Recover();return 0;
 case WM_HOTKEY:if(w==HOTKEY_RECOVER)Recover();else if(w>=HOTKEY_PRESET&&w<HOTKEY_PRESET+9)Event("presetHotkey",{{"index",w-HOTKEY_PRESET}});return 0;
 }
 if(web_.Mouse(m,w,l))return 0;
 return DefWindowProcW(hwnd_,m,w,l);
}
void Application::CaptureNormal(){if(hwnd_&&!IsIconic(hwnd_)&&!IsZoomed(hwnd_))GetWindowRect(hwnd_,&normal_);}
Json Application::WindowState()const{
 RECT r=normal_;if(!IsIconic(hwnd_)&&!IsZoomed(hwnd_))GetWindowRect(hwnd_,&r);
 const auto monitor=MonitorFromRect(&r,MONITOR_DEFAULTTONEAREST);MONITORINFOEXW mi{};mi.cbSize=sizeof(mi);GetMonitorInfoW(monitor,reinterpret_cast<MONITORINFO*>(&mi));const UINT dpi=GetDpiForWindow(hwnd_)?GetDpiForWindow(hwnd_):96;
 return{{"width",Dip(r.right-r.left,dpi)},{"height",Dip(r.bottom-r.top,dpi)},{"x",Dip(r.left-mi.rcWork.left,dpi)},{"y",Dip(r.top-mi.rcWork.top,dpi)},{"monitor",Utf8(mi.szDevice)},{"dpi",dpi},{"maximized",IsZoomed(hwnd_)!=FALSE}};
}
void Application::ApplyWindow(const Json&j){
 if(!j.is_object())throw std::runtime_error("Invalid window geometry.");
 // Session geometry carries a position; presets carry only a size and resize in place.
 const bool placed=j.contains("x")&&j.contains("y");
 MonitorSearch search{Wide(j.value("monitor",std::string()))};if(placed)EnumDisplayMonitors(nullptr,nullptr,FindMonitor,reinterpret_cast<LPARAM>(&search));
 auto monitor=search.found?search.found:MonitorFromWindow(hwnd_,placed?MONITOR_DEFAULTTOPRIMARY:MONITOR_DEFAULTTONEAREST);MONITORINFO mi{sizeof(mi)};GetMonitorInfoW(monitor,&mi);
 // Move to the target first so GetDpiForWindow reflects that monitor. WM_DPICHANGED
 // handles scaling; stored width/height are DIPs, not raw old-monitor pixels.
 if(IsZoomed(hwnd_)||IsIconic(hwnd_))ShowWindow(hwnd_,SW_RESTORE);
 if(placed)SetWindowPos(hwnd_,nullptr,mi.rcWork.left,mi.rcWork.top,0,0,SWP_NOSIZE|SWP_NOZORDER|SWP_NOACTIVATE);
 const UINT dpi=GetDpiForWindow(hwnd_)?GetDpiForWindow(hwnd_):96;
 const int mw=mi.rcWork.right-mi.rcWork.left,mh=mi.rcWork.bottom-mi.rcWork.top;
 const int width=std::min(mw,Pixel(Number(j,"width",800,180,12000),dpi)),height=std::min(mh,Pixel(Number(j,"height",600,120,12000),dpi));
 RECT cur{};GetWindowRect(hwnd_,&cur);
 const int x=mi.rcWork.left+std::clamp(placed?Pixel(Number(j,"x",40,-12000,12000),dpi):static_cast<int>(cur.left-mi.rcWork.left),0,std::max(0,mw-width));
 const int y=mi.rcWork.top+std::clamp(placed?Pixel(Number(j,"y",40,-12000,12000),dpi):static_cast<int>(cur.top-mi.rcWork.top),0,std::max(0,mh-height));
 SetWindowPos(hwnd_,nullptr,x,y,width,height,SWP_NOZORDER|SWP_NOACTIVATE);CaptureNormal();
 if(j.value("maximized",false))ShowWindow(hwnd_,SW_MAXIMIZE);web_.Resize();
}
void Application::ApplySettings(const Json&input,bool allow){
 auto s=CleanSettings(input);const bool through=s.value("clickThrough",false);
 if(through&&(!allow||!recovery_||!tray_))throw std::runtime_error("Click-through is disabled: an explicit request, recovery hotkey and tray icon are all required.");
 web_.Opacity(s["opacity"].get<double>());
 auto ex=GetWindowLongPtrW(hwnd_,GWL_EXSTYLE);
 // WS_EX_TRANSPARENT alone is a paint-order flag. Pairing it with a layered
 // top-level window gives documented cross-process mouse pass-through.
 if(through){ex|=WS_EX_LAYERED|WS_EX_TRANSPARENT;SetWindowLongPtrW(hwnd_,GWL_EXSTYLE,ex);if(!SetLayeredWindowAttributes(hwnd_,0,255,LWA_ALPHA)){SetWindowLongPtrW(hwnd_,GWL_EXSTYLE,ex&~(WS_EX_LAYERED|WS_EX_TRANSPARENT));throw std::runtime_error("Windows could not enable layered click-through.");}}
 else if(ex&(WS_EX_LAYERED|WS_EX_TRANSPARENT))SetWindowLongPtrW(hwnd_,GWL_EXSTYLE,ex&~(WS_EX_LAYERED|WS_EX_TRANSPARENT));
 settings_=std::move(s);SetWindowPos(hwnd_,settings_.value("alwaysOnTop",false)?HWND_TOPMOST:HWND_NOTOPMOST,0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE|SWP_FRAMECHANGED);SyncPause();
}
void Application::Show(){ShowWindow(hwnd_,IsZoomed(hwnd_)?SW_SHOW:SW_RESTORE);SetForegroundWindow(hwnd_);web_.Visible(true);SyncPause();web_.Focus();}
void Application::Recover(){auto s=settings_;s["clickThrough"]=false;s["chromeHidden"]=false;s["opacity"]=std::max(.7,s.value("opacity",1.0));ApplySettings(s,false);Show();Event("nativeSettings",settings_);Event("notice",{{"message","Overlay recovered — mouse input and application bars are enabled."}});}
void Application::SetPaused(bool paused){manualPause_=paused;SyncPause();}
void Application::SyncPause(){const bool background=IsIconic(hwnd_)||!IsWindowVisible(hwnd_);const bool paused=manualPause_||(settings_.value("pauseWhenMinimized",true)&&background);telemetry_.Pause(paused);Event("pause",{{"paused",paused}});}
bool Application::CreateTray(){NOTIFYICONDATAW n{};n.cbSize=sizeof(n);n.hWnd=hwnd_;n.uID=1;n.uFlags=NIF_MESSAGE|NIF_ICON|NIF_TIP;n.uCallbackMessage=WM_TRAY;n.hIcon=LoadIconW(instance_,MAKEINTRESOURCEW(101));wcscpy_s(n.szTip,L"PulseView — Ctrl+Alt+Shift+F11 restores input");if(!Shell_NotifyIconW(NIM_ADD,&n))return false;n.uVersion=NOTIFYICON_VERSION_4;Shell_NotifyIconW(NIM_SETVERSION,&n);return true;}
void Application::TrayMenu(){
 HMENU menu=CreatePopupMenu();AppendMenuW(menu,MF_STRING,1,L"Show / recover mouse input");AppendMenuW(menu,MF_STRING|(settings_.value("alwaysOnTop",false)?MF_CHECKED:0),2,L"Always on top");AppendMenuW(menu,MF_STRING|(manualPause_?MF_CHECKED:0),3,L"Pause sampling");AppendMenuW(menu,MF_SEPARATOR,0,nullptr);AppendMenuW(menu,MF_STRING,4,L"Open preset folder");AppendMenuW(menu,MF_STRING,5,L"Exit PulseView");POINT p{};GetCursorPos(&p);SetForegroundWindow(hwnd_);const auto cmd=TrackPopupMenu(menu,TPM_RETURNCMD|TPM_RIGHTBUTTON,p.x,p.y,0,hwnd_,nullptr);DestroyMenu(menu);PostMessageW(hwnd_,WM_NULL,0,0);
 if(cmd==1)Recover();else if(cmd==2){auto s=settings_;s["alwaysOnTop"]=!s.value("alwaysOnTop",false);ApplySettings(s,s.value("clickThrough",false));Event("nativeSettings",settings_);}else if(cmd==3)SetPaused(!manualPause_);else if(cmd==4){auto dir=storage_.Folder("presets");ShellExecuteW(hwnd_,L"open",dir.c_str(),nullptr,nullptr,SW_SHOWNORMAL);}else if(cmd==5)Exit(true);
}
void Application::Exit(bool force){if(closing_)return;Event("saveRequested");if(!force&&settings_.value("closeToTray",false)&&tray_){ShowWindow(hwnd_,SW_HIDE);web_.Visible(false);SyncPause();return;}closing_=true;exiting_=true;if(uiReady_)SetTimer(hwnd_,TIMER_CLOSE,950,nullptr);else{telemetry_.Stop();web_.Close();DestroyWindow(hwnd_);}}
void Application::Event(const std::string&name,const Json&data){if(uiReady_)web_.Post({{"v",1},{"event",name},{"data",data}});}
void Application::QueueTelemetry(Json packet){bool post=false;{std::lock_guard lock(pendingMutex_);for(auto it=packet.begin();it!=packet.end();++it)pending_[it.key()]=std::move(it.value());if(!eventQueued_){eventQueued_=true;post=true;}}if(post&&hwnd_)PostMessageW(hwnd_,WM_PACKET,0,0);}
void Application::DeliverTelemetry(){Json p;{std::lock_guard lock(pendingMutex_);p=std::move(pending_);pending_=Json::object();eventQueued_=false;}if(p.contains("catalog"))Event("catalog",p["catalog"]);if(p.contains("metrics"))Event("metrics",p["metrics"]);}
Json Application::Capabilities()const{return{{"native",true},{"tray",tray_},{"recoveryHotkey",recovery_},{"opacity",true},{"clickThrough",tray_&&recovery_},{"presetHotkeys",presetKeys_}};}
void Application::OnMessage(const Json&m){
 std::string id;
 try{
  if(!m.is_object()||m.value("v",0)!=1||!m.contains("id")||!m["id"].is_string())throw std::runtime_error("Invalid RPC envelope.");id=m["id"].get<std::string>();if(id.size()>80)throw std::runtime_error("RPC ID too long.");const auto method=m.at("method").get<std::string>();const auto p=m.value("params",Json::object());if(!p.is_object())throw std::runtime_error("RPC params must be an object.");
  auto result=Dispatch(method,p);web_.Post({{"v",1},{"id",id},{"ok",true},{"result",std::move(result)}});
 }catch(const std::exception&e){Log(std::string("RPC: ")+e.what());if(!id.empty())web_.Post({{"v",1},{"id",id},{"ok",false},{"error",{{"message",e.what()}}}});}
}
Json Application::Dispatch(const std::string&m,const Json&p){
 if(m=="app.ready"){uiReady_=true;telemetry_.Start();return{{"session",session_},{"presets",storage_.Presets()},{"themes",storage_.Themes()},{"capabilities",Capabilities()},{"dataPath",Utf8(storage_.Root().wstring())}};}
 if(!uiReady_)throw std::runtime_error("UI handshake is required.");
 if(m=="monitor.configure"){telemetry_.Configure(p.value("settings",settings_),p.value("metrics",Json::array()));return{{"applied",p.value("settings",settings_)}};}
 if(m=="monitor.pause"){SetPaused(p.value("paused",false));return{{"paused",manualPause_}};}
 if(m=="presets.list")return storage_.Presets();
 if(m=="presets.save"){auto preset=p.at("preset");if(!p.value("preserveWindow",false))preset["window"]=WindowState();return storage_.SavePreset(std::move(preset));}
 if(m=="presets.delete"){storage_.DeletePreset(p.at("id").get<std::string>());return Json::object();}
 if(m=="presets.export")return ExportPreset(p.at("preset"));
 if(m=="session.save"){auto s=p.at("session");s["window"]=WindowState();s["settings"]=settings_;storage_.SaveSession(s);session_=std::move(s);return Json::object();}
 if(m=="window.state")return WindowState();
 if(m=="window.apply"){ApplyWindow(p.at("window"));return{{"applied",WindowState()}};}
 if(m=="window.minimum"){minimumWidth_=static_cast<int>(Number(p,"width",380,180,20000));minimumHeight_=static_cast<int>(Number(p,"height",230,120,20000));return Json::object();}
 if(m=="window.chrome"){
  if(!p.contains("hidden")||!p["hidden"].is_boolean())throw std::runtime_error("hidden must be a boolean.");
  settings_["chromeHidden"]=p["hidden"];
  // Resize the frame by exactly the bars (DIPs from the UI) so the workspace keeps its size and screen position.
  if(p.contains("adjust")&&p["adjust"].is_object()&&!IsZoomed(hwnd_)&&!IsIconic(hwnd_)){
   const auto&a=p["adjust"];const UINT dpi=GetDpiForWindow(hwnd_)?GetDpiForWindow(hwnd_):96;
   RECT r{};GetWindowRect(hwnd_,&r);MONITORINFO mi{sizeof(mi)};GetMonitorInfoW(MonitorFromWindow(hwnd_,MONITOR_DEFAULTTONEAREST),&mi);
   const int w=std::max(1,static_cast<int>(r.right-r.left)+Pixel(Number(a,"width",0,-4000,4000),dpi)),h=std::max(1,static_cast<int>(r.bottom-r.top)+Pixel(Number(a,"height",0,-4000,4000),dpi));
   const int x=std::max<int>(mi.rcWork.left,r.left+Pixel(Number(a,"x",0,-4000,4000),dpi)),y=std::max<int>(mi.rcWork.top,r.top+Pixel(Number(a,"y",0,-4000,4000),dpi));
   // The debounced minimum from the UI still reflects the old chrome; never let it block the shrink.
   minimumWidth_=std::min(minimumWidth_,static_cast<int>(Dip(w,dpi)));minimumHeight_=std::min(minimumHeight_,static_cast<int>(Dip(h,dpi)));
   SetWindowPos(hwnd_,nullptr,x,y,w,h,SWP_NOZORDER|SWP_NOACTIVATE);
  }
  return{{"hidden",settings_["chromeHidden"]}};
 }
 if(m=="window.configure"){ApplySettings(p.value("settings",settings_),p.value("allowClickThrough",false));return{{"settings",settings_}};}
 if(m=="window.command"){
  const auto cmd=p.value("command",std::string());if(cmd=="minimize")ShowWindow(hwnd_,SW_MINIMIZE);else if(cmd=="maximize")ShowWindow(hwnd_,IsZoomed(hwnd_)?SW_RESTORE:SW_MAXIMIZE);else if(cmd=="close")Exit(false);else if(cmd=="drag")PostMessageW(hwnd_,WM_DRAG,0,0);else throw std::runtime_error("Unknown window command.");return Json::object();
 }
 if(m=="themes.list")return storage_.Themes();
 if(m=="themes.install")return storage_.InstallTheme(p);
 if(m=="app.openFolder"){auto dir=storage_.Folder(p.value("folder",std::string("data")));const auto r=ShellExecuteW(hwnd_,L"open",dir.c_str(),nullptr,nullptr,SW_SHOWNORMAL);if(reinterpret_cast<INT_PTR>(r)<=32)throw std::runtime_error("Could not open the data folder.");return Json::object();}
 if(m=="app.diagnostics")return{{"mode","Native Windows telemetry"},{"version","1.1.0"},{"webView2Runtime",web_.RuntimeVersion()},{"dataPath",Utf8(storage_.Root().wstring())},{"capabilities",Capabilities()},{"collector",telemetry_.Diagnostics()},{"settings",settings_}};
 throw std::runtime_error("Unknown RPC method: "+m);
}
Json Application::ExportPreset(const Json&p){
 ValidatePreset(p);ComPtr<IFileSaveDialog>dialog;Check(CoCreateInstance(CLSID_FileSaveDialog,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&dialog)),"Create export dialog");
 dialog->SetOptions(FOS_FORCEFILESYSTEM|FOS_OVERWRITEPROMPT|FOS_PATHMUSTEXIST);
 COMDLG_FILTERSPEC type={L"PulseView preset (*.json)",L"*.json"};dialog->SetFileTypes(1,&type);dialog->SetDefaultExtension(L"json");const auto filename=Wide(p.value("id",std::string("preset"))+".json");dialog->SetFileName(filename.c_str());
 const auto hr=dialog->Show(hwnd_);if(hr==HRESULT_FROM_WIN32(ERROR_CANCELLED))return{{"cancelled",true}};Check(hr,"Choose preset export path");ComPtr<IShellItem>item;Check(dialog->GetResult(&item),"Get export path");PWSTR raw=nullptr;Check(item->GetDisplayName(SIGDN_FILESYSPATH,&raw),"Read export path");std::filesystem::path path(raw);CoTaskMemFree(raw);AtomicWrite(path,p.dump(2));return{{"path",Utf8(path.wstring())}};
}
}
