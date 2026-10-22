#pragma once
#include "WinUtil.h"
#include <pdh.h>
#include <pdhmsg.h>
#include <map>
#include <optional>
#include <vector>
namespace pulse {
struct CounterArray {bool valid=false;std::map<std::wstring,double> values;};
class PdhQuery {
public:
 PdhQuery();~PdhQuery();PdhQuery(const PdhQuery&)=delete;PdhQuery&operator=(const PdhQuery&)=delete;
 bool Add(const std::string&key,const wchar_t* englishPath);
 bool Has(const std::string&key)const;
 bool Collect();void ResetBaseline(){warm_=false;}
 std::optional<double> Value(const std::string&key)const;
 CounterArray Array(const std::string&key)const;
private:PDH_HQUERY query_=nullptr;std::map<std::string,PDH_HCOUNTER> counters_;bool warm_=false,ready_=false;
};
}
