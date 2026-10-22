#pragma once
#include "WinUtil.h"
#include <objbase.h> // WIN32_LEAN_AND_MEAN omits the COM `interface` macro WebView2.h needs
#include <WebView2.h>
#include <dcomp.h>
#include <wrl.h>
#include <functional>
#include <deque>

namespace pulse {
// Composition hosting is intentional: the opacity effect includes the complete
// HTML surface, not just the CSS background. No visible browser window is opened.
class WebViewHost {
public:
 using MessageHandler=std::function<void(const Json&)>;
 using FailureHandler=std::function<void(const std::string&)>;
 WebViewHost()=default;
 ~WebViewHost(){Close();}
 static constexpr UINT DeferredMessage=WM_APP+4;
 void PumpDeferred();
 void Initialize(HWND hwnd,const std::filesystem::path& data,MessageHandler onMessage,FailureHandler onFailure);
 void Close();
 void Resize();
 void ParentMoved();
 void Focus();
 void Visible(bool visible);
 void Opacity(double opacity);
 void Post(const Json& message);
 bool Mouse(UINT message,WPARAM wparam,LPARAM lparam);
 bool Cursor();
 std::string RuntimeVersion()const{return runtime_;}
 bool Ready()const{return webview_!=nullptr;}
private:
 void Defer(std::function<void()> action);
 void Attach(ICoreWebView2CompositionController* composition);
 void Secure();
 void Fail(const std::string& message)noexcept;
 HWND hwnd_=nullptr;bool closing_=false,tracking_=false;double opacity_=1;
 std::deque<std::function<void()>> deferred_;
 MessageHandler onMessage_;FailureHandler onFailure_;std::string runtime_;
 Microsoft::WRL::ComPtr<ICoreWebView2Environment> environment_;
 Microsoft::WRL::ComPtr<ICoreWebView2Controller> controller_;
 Microsoft::WRL::ComPtr<ICoreWebView2CompositionController> composition_;
 Microsoft::WRL::ComPtr<ICoreWebView2> webview_;
 Microsoft::WRL::ComPtr<IDCompositionDevice> device_;
 Microsoft::WRL::ComPtr<IDCompositionTarget> target_;
 Microsoft::WRL::ComPtr<IDCompositionVisual> root_,webVisual_;
 Microsoft::WRL::ComPtr<IDCompositionEffectGroup> effect_;
};
}
