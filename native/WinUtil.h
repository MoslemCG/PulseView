#pragma once
#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <filesystem>
#include <string>
#include <stdexcept>
#include <nlohmann/json.hpp>

namespace pulse {
using Json=nlohmann::json;
std::wstring Wide(const std::string& value);
std::string Utf8(const std::wstring& value);
std::filesystem::path ExecutableDirectory();
std::filesystem::path DataDirectory();
std::string ReadText(const std::filesystem::path& path,std::size_t maximum=4*1024*1024);
void AtomicWrite(const std::filesystem::path& path,const std::string& data,bool backup=true);
void Log(const std::string& message) noexcept;
std::string HResultText(HRESULT hr);
void Check(HRESULT hr,const char* what);
bool SafeId(const std::string& id);
void ValidatePreset(const Json& preset);
Json CleanSettings(const Json& settings);
}
