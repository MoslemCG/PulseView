#pragma once
#include "Storage.h"
#include "Telemetry.h"
#include "WebViewHost.h"
#include <shellapi.h>
#include <mutex>
#include <array>
namespace pulse {
class Application {
public:
 explicit Application(bool safeMode=false);
 ~Application();
 int Run(HINSTANCE instance,int show);
private:
 static LRESULT CALLBACK Procedure(HWND,UINT,WPARAM,LPARAM);
 LRESULT Handle(UINT,WPARAM,LPARAM);
 void OnMessage(const Json&);
 Json Dispatch(const std::string&,const Json&);
 void QueueTelemetry(Json);
 void DeliverTelemetry();
 void Event(const std::string&,const Json& data=Json::object());
 Json WindowState()const;
 void ApplyWindow(const Json&);
 void ApplySettings(const Json&,bool allowClickThrough);
 void CaptureNormal();
 void Recover();
 void Show();
 void SetPaused(bool);
 void SyncPause();
 bool CreateTray();
 void TrayMenu();
 void Exit(bool force);
 Json ExportPreset(const Json&);
 Json Capabilities()const;
 HWND hwnd_=nullptr;HINSTANCE instance_=nullptr;
 Storage storage_;WebViewHost web_;Telemetry telemetry_;
 Json settings_=CleanSettings(Json::object()),session_=nullptr;
 bool safeMode_=false,uiReady_=false,tray_=false,recovery_=false,manualPause_=false,closing_=false,exiting_=false;
 bool eventQueued_=false;std::mutex pendingMutex_;Json pending_=Json::object();
 RECT normal_={100,100,540,410};int minimumWidth_=380,minimumHeight_=230;
 UINT taskbarCreated_=0;std::array<bool,9>presetKeys_{};
};
}
