#include "WinUtil.h"
#include <iostream>
#include <filesystem>
int main(){
 try {
  using namespace pulse;
  Json preset={{"schemaVersion",1},{"id","test"},{"name","Test"},{"layout",{{"kind","leaf"},{"id","leaf1"},{"widget",nullptr}}},{"settings",Json::object()}};
  ValidatePreset(preset);
  const auto defaults=CleanSettings(Json::object());
  if(defaults.at("chromeHidden")!=false||defaults.at("compact")!=true)throw std::runtime_error("Backward-compatible presentation defaults failed.");
  const auto compact=CleanSettings({{"chromeHidden",true},{"compact",false},{"refreshSeconds",2.0},{"opacity",0.8}});
  if(compact.at("chromeHidden")!=true||compact.at("compact")!=false||compact.at("refreshSeconds")!=2.0||compact.at("opacity")!=0.8)throw std::runtime_error("Independent charts-only setting was not retained.");
  if(CleanSettings({{"chromeHidden","true"}}).at("chromeHidden")!=false)throw std::runtime_error("Nonboolean chrome flag accepted.");
  preset["settings"]=compact;
  ValidatePreset(preset);
  int caught=0;for(const auto&bad:{std::string("../escape"),std::string("a/b"),std::string(101,'a')}){auto p=preset;p["id"]=bad;try{ValidatePreset(p);}catch(...){++caught;}}
  if(caught!=3)throw std::runtime_error("Invalid file IDs accepted.");
  const auto temp=std::filesystem::temp_directory_path()/(L"PulseView-validation-"+std::to_wstring(GetCurrentProcessId()));
  std::filesystem::create_directories(temp);const auto path=temp/L"roundtrip.json";
  AtomicWrite(path,preset.dump(2));auto revised=preset;revised["name"]="Updated";AtomicWrite(path,revised.dump(2));
  if(Json::parse(ReadText(path))["name"]!="Updated")throw std::runtime_error("Atomic save failed.");
  if(Json::parse(ReadText(path))["settings"]["chromeHidden"]!=true)throw std::runtime_error("Compact preset did not survive disk roundtrip.");
  if(Json::parse(ReadText(path.wstring()+L".bak"))["name"]!="Test")throw std::runtime_error("Backup failed.");
  std::filesystem::remove_all(temp);
  std::cout<<"Native schema and atomic file checks passed\n";return 0;
 }catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}
}
