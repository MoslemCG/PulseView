#include <algorithm>
#include "WinUtil.h"
#include <shlobj.h>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <mutex>
#include <set>
#include <cmath>
#include <chrono>

namespace pulse {
std::wstring Wide(const std::string& value){
 if(value.empty())return{};const int n=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,value.data(),static_cast<int>(value.size()),nullptr,0);
 if(!n)throw std::runtime_error("Invalid UTF-8 string.");std::wstring out(static_cast<std::size_t>(n),L'\0');MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,value.data(),static_cast<int>(value.size()),out.data(),n);return out;
}
std::string Utf8(const std::wstring& value){if(value.empty())return{};const int n=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,value.data(),static_cast<int>(value.size()),nullptr,0,nullptr,nullptr);if(!n)return"[invalid text]";std::string out(static_cast<std::size_t>(n),'\0');WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,value.data(),static_cast<int>(value.size()),out.data(),n,nullptr,nullptr);return out;}
std::filesystem::path ExecutableDirectory(){std::wstring p(32768,L'\0');const DWORD n=GetModuleFileNameW(nullptr,p.data(),static_cast<DWORD>(p.size()));if(!n||n==p.size())throw std::runtime_error("Cannot locate executable.");p.resize(n);return std::filesystem::path(p).parent_path();}
std::filesystem::path DataDirectory(){PWSTR value=nullptr;Check(SHGetKnownFolderPath(FOLDERID_LocalAppData,KF_FLAG_CREATE,nullptr,&value),"Locate LocalAppData");std::filesystem::path p(value);CoTaskMemFree(value);p/=L"PulseView";std::filesystem::create_directories(p);return p;}
std::string ReadText(const std::filesystem::path& path,std::size_t maximum){const auto size=std::filesystem::file_size(path);if(size>maximum)throw std::runtime_error("File exceeds allowed size: "+Utf8(path.filename().wstring()));std::ifstream f(path,std::ios::binary);if(!f)throw std::runtime_error("Cannot read file: "+Utf8(path.filename().wstring()));std::string s(static_cast<std::size_t>(size),'\0');if(size&&!f.read(s.data(),static_cast<std::streamsize>(size)))throw std::runtime_error("Incomplete file read.");if(s.size()>=3&&static_cast<unsigned char>(s[0])==0xef&&static_cast<unsigned char>(s[1])==0xbb&&static_cast<unsigned char>(s[2])==0xbf)s.erase(0,3);return s;}
void AtomicWrite(const std::filesystem::path& path,const std::string& data,bool backup){
 std::filesystem::create_directories(path.parent_path());const auto temp=path.wstring()+L".tmp";
 HANDLE h=CreateFileW(temp.c_str(),GENERIC_WRITE,0,nullptr,CREATE_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);
 if(h==INVALID_HANDLE_VALUE)throw std::runtime_error("Cannot create temporary file. Check write permissions.");
 DWORD written=0;bool good=data.size()<=MAXDWORD&&WriteFile(h,data.data(),static_cast<DWORD>(data.size()),&written,nullptr)&&written==data.size()&&FlushFileBuffers(h);CloseHandle(h);
 if(!good){DeleteFileW(temp.c_str());throw std::runtime_error("File write or flush failed. Original file is unchanged.");}
 if(backup&&std::filesystem::exists(path)){
  const auto bak=path.wstring()+L".bak";
  if(!CopyFileW(path.c_str(),bak.c_str(),FALSE)){DeleteFileW(temp.c_str());throw std::runtime_error("Could not back up existing file. Save was cancelled.");}
 }
 if(!MoveFileExW(temp.c_str(),path.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)){DeleteFileW(temp.c_str());throw std::runtime_error("Atomic file replacement failed. Original file is unchanged.");}
}
void Log(const std::string& message) noexcept{
 static std::mutex mutex;try{std::lock_guard lock(mutex);auto p=DataDirectory()/L"pulseview.log";if(std::filesystem::exists(p)&&std::filesystem::file_size(p)>2*1024*1024){std::error_code ec;std::filesystem::remove(p.wstring()+L".old",ec);std::filesystem::rename(p,p.wstring()+L".old",ec);}SYSTEMTIME t{};GetLocalTime(&t);std::ofstream f(p,std::ios::app);f<<std::setfill('0')<<t.wYear<<'-'<<std::setw(2)<<t.wMonth<<'-'<<std::setw(2)<<t.wDay<<' '<<std::setw(2)<<t.wHour<<':'<<std::setw(2)<<t.wMinute<<':'<<std::setw(2)<<t.wSecond<<" "<<message<<"\n";}catch(...){}
}
std::string HResultText(HRESULT hr){std::ostringstream out;out<<"0x"<<std::hex<<std::uppercase<<static_cast<unsigned long>(hr);return out.str();}
void Check(HRESULT hr,const char* what){if(FAILED(hr))throw std::runtime_error(std::string(what)+" failed ("+HResultText(hr)+").");}
bool SafeId(const std::string& id){return !id.empty()&&id.size()<=100&&std::all_of(id.begin(),id.end(),[](unsigned char c){return(c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='-'||c=='_';});}
namespace {
void ValidateNode(const Json& n,std::set<std::string>& ids,int depth,int& count){
 if(!n.is_object()||depth>32)throw std::runtime_error("Invalid layout or split tree too deep.");
 if(!n.contains("id")||!n["id"].is_string())throw std::runtime_error("Missing layout node ID.");const std::string id=n["id"];if(!SafeId(id)||!ids.insert(id).second)throw std::runtime_error("Invalid or duplicate layout node ID.");
 const auto kind=n.value("kind",std::string());if(kind=="leaf"){
  if(++count>128)throw std::runtime_error("More than 128 panes in one layout.");
  if(!n.contains("widget")||(!n["widget"].is_null()&&!n["widget"].is_object()))throw std::runtime_error("Invalid widget description.");
  if(n["widget"].is_object()&&n["widget"].dump().size()>64*1024)throw std::runtime_error("Widget configuration is too large.");
 }else if(kind=="split"){
  const std::string axis=n.value("axis",std::string());if(axis!="x"&&axis!="y")throw std::runtime_error("Invalid split direction.");
  if(!n.contains("ratio")||!n["ratio"].is_number())throw std::runtime_error("Invalid split ratio.");const auto ratio=n["ratio"].get<double>();if(!std::isfinite(ratio)||ratio<.02||ratio>.98)throw std::runtime_error("Split ratio out of range.");ValidateNode(n.at("a"),ids,depth+1,count);ValidateNode(n.at("b"),ids,depth+1,count);
 }else throw std::runtime_error("Unknown layout node type.");
}
}
void ValidatePreset(const Json& p){
 if(!p.is_object()||p.value("schemaVersion",0)!=1)throw std::runtime_error("Unsupported preset schema.");
 const auto name=p.value("name",std::string());if(name.empty()||name.size()>400)throw std::runtime_error("Invalid preset name.");
 if(p.contains("id")&&(!p["id"].is_string()||!SafeId(p["id"].get<std::string>())))throw std::runtime_error("Invalid preset ID.");
 std::set<std::string> ids;int count=0;ValidateNode(p.at("layout"),ids,0,count);
 if(p.contains("settings")&&!p["settings"].is_object())throw std::runtime_error("Settings must be an object.");if(p.contains("window")&&!p["window"].is_object())throw std::runtime_error("Window state must be an object.");
 if(p.dump().size()>4*1024*1024)throw std::runtime_error("Preset is too large.");
}
Json CleanSettings(const Json& input){
 Json s=input.is_object()?input:Json::object();
 for(const auto* key:{"alwaysOnTop","clickThrough","layoutLocked","minimizeToTray","closeToTray","chromeHidden","timeCompression"})if(!s.contains(key)||!s[key].is_boolean())s[key]=false;
 for(const auto* key:{"pauseWhenMinimized","restoreWindow","compact","focusOnChartClick"})if(!s.contains(key)||!s[key].is_boolean())s[key]=true;
 auto number=[&](const char* key,double def,double lo,double hi){double value=s.contains(key)&&s[key].is_number()?s[key].get<double>():def;if(!std::isfinite(value))value=def;s[key]=std::clamp(value,lo,hi);};
 number("refreshSeconds",1,.25,60);number("opacity",1,.25,1);number("retentionSeconds",600,60,3600);
 number("historyNormal",120,15,3600);number("historyCompressed",600,15,3600);number("compressStart",.25,0,.9);number("compressFactor",4,1,16);
 if(!s.contains("theme")||!s["theme"].is_string()||!SafeId(s["theme"].get<std::string>()))s["theme"]="midnight";
 return s;
}
}
