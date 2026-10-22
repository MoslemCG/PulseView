#pragma once
#include "WinUtil.h"
namespace pulse {
class Storage {
public:
 Storage();
 const std::filesystem::path& Root()const{return root_;}
 std::filesystem::path Folder(const std::string& kind)const;
 Json Presets()const;
 Json SavePreset(Json preset)const;
 void DeletePreset(const std::string& id)const;
 Json Session()const;
 void SaveSession(const Json& session)const;
 Json Themes()const;
 Json InstallTheme(const Json& theme)const;
private:std::filesystem::path root_;
};
}
