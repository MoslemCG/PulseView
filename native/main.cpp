#include "Application.h"
#include <shellapi.h>
#include <string>

int WINAPI wWinMain(HINSTANCE instance,HINSTANCE,LPWSTR,int show){
 HANDLE singleton=nullptr;
 const HRESULT com=CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);
 if(FAILED(com)){MessageBoxW(nullptr,L"COM initialization failed.",L"PulseView",MB_ICONERROR);return 1;}
 int result=1;
 try{
  singleton=CreateMutexW(nullptr,FALSE,L"Local\\PulseView.SingleWriter.1");
  if(!singleton)throw std::runtime_error("Cannot create the single-instance lock.");
  if(GetLastError()==ERROR_ALREADY_EXISTS){auto h=FindWindowW(L"PulseView.MainWindow.1",nullptr);if(h){ShowWindow(h,SW_RESTORE);SetForegroundWindow(h);}CloseHandle(singleton);CoUninitialize();return 0;}
  int argc=0;auto argv=CommandLineToArgvW(GetCommandLineW(),&argc);bool safe=false;for(int i=1;argv&&i<argc;++i)if(std::wstring(argv[i])==L"--safe-mode")safe=true;if(argv)LocalFree(argv);
  {pulse::Application app(safe);result=app.Run(instance,show);}
 }catch(const std::exception&e){pulse::Log(e.what());MessageBoxW(nullptr,pulse::Wide(e.what()).c_str(),L"PulseView — startup error",MB_OK|MB_ICONERROR);}
 if(singleton)CloseHandle(singleton);CoUninitialize();return result;
}
