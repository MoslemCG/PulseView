#include "Storage.h"
#include <algorithm>
#include <regex>
namespace pulse {
Storage::Storage():root_(DataDirectory()){for(auto f:{L"presets",L"themes",L"exports",L"WebView2"})std::filesystem::create_directories(root_/f);}
std::filesystem::path Storage::Folder(const std::string& kind)const{if(kind=="data")return root_;if(kind!="presets"&&kind!="themes"&&kind!="exports")throw std::runtime_error("Unknown data folder.");return root_/Wide(kind);}
Json Storage::Presets()const{
 Json result=Json::array();for(const auto& e:std::filesystem::directory_iterator(Folder("presets"))){if(!e.is_regular_file()||e.path().extension()!=L".json")continue;try{auto p=Json::parse(ReadText(e.path()));ValidatePreset(p);if(!p.contains("id")||e.path().stem()!=Wide(p.at("id").get<std::string>()))throw std::runtime_error("Preset ID does not match its filename.");p["builtin"]=false;result.push_back(std::move(p));}catch(const std::exception& ex){Log("Skipping invalid preset "+Utf8(e.path().filename().wstring())+": "+ex.what());}}
 std::sort(result.begin(),result.end(),[](const Json&a,const Json&b){return a.value("name",std::string())<b.value("name",std::string());});return result;
}
Json Storage::SavePreset(Json p)const{ValidatePreset(p);const std::string id=p.at("id");if(id.rfind("builtin-",0)==0)throw std::runtime_error("Built-in layouts must be saved as a new copy.");p["builtin"]=false;p["settings"]=CleanSettings(p.value("settings",Json::object()));AtomicWrite(Folder("presets")/(Wide(id)+L".json"),p.dump(2));return p;}
void Storage::DeletePreset(const std::string&id)const{if(!SafeId(id))throw std::runtime_error("Invalid preset ID.");const auto p=Folder("presets")/(Wide(id)+L".json");if(!std::filesystem::remove(p))throw std::runtime_error("Preset file was not found.");std::error_code ec;std::filesystem::remove(p.wstring()+L".bak",ec);}
Json Storage::Session()const{for(const auto* name:{L"session.json",L"session.json.bak"}){const auto p=root_/name;if(!std::filesystem::exists(p))continue;try{auto s=Json::parse(ReadText(p));ValidatePreset(s);s["settings"]=CleanSettings(s.value("settings",Json::object()));s["settings"]["clickThrough"]=false;return s;}catch(const std::exception& e){Log(std::string("Session restore: ")+e.what());}}return nullptr;}
void Storage::SaveSession(const Json&s)const{ValidatePreset(s);AtomicWrite(root_/L"session.json",s.dump(2));}
Json Storage::Themes()const{
 Json result=Json::array();for(const auto&e:std::filesystem::directory_iterator(Folder("themes"))){if(!e.is_regular_file()||e.path().extension()!=L".css")continue;
 try{const std::string id=Utf8(e.path().stem().wstring());if(!SafeId(id))continue;const auto css=ReadText(e.path(),256*1024);std::smatch match;std::string name=id;if(std::regex_search(css,match,std::regex(R"(@name\s+([^\r\n*]+))")))name=match[1].str();result.push_back({{"id",id},{"name",name},{"css",css}});}catch(const std::exception&ex){Log(std::string("Theme load: ")+ex.what());}}
 std::sort(result.begin(),result.end(),[](const Json&a,const Json&b){return a["name"]<b["name"];});return result;
}
Json Storage::InstallTheme(const Json&t)const{
 const auto id=t.value("id",std::string()),css=t.value("css",std::string());if(!SafeId(id)||id.rfind("custom-",0)!=0||css.size()>256*1024)throw std::runtime_error("Invalid CSS theme or excessive size.");
 AtomicWrite(Folder("themes")/(Wide(id)+L".css"),css);return t;
}
}
