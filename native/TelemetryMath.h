#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <map>
#include <optional>
#include <string>

namespace pulse {
inline std::optional<double> Rate(std::uint64_t before,std::uint64_t after,double seconds) {
    if(after<before || !std::isfinite(seconds) || seconds<=0.0) return std::nullopt;
    return static_cast<double>(after-before)/seconds;
}
inline std::optional<double> CpuBusy(std::uint64_t idleBefore,std::uint64_t kernelBefore,std::uint64_t userBefore,
                                     std::uint64_t idleAfter,std::uint64_t kernelAfter,std::uint64_t userAfter) {
    if(idleAfter<idleBefore||kernelAfter<kernelBefore||userAfter<userBefore) return std::nullopt;
    const auto idle=idleAfter-idleBefore,total=(kernelAfter-kernelBefore)+(userAfter-userBefore);
    if(!total||idle>total)return std::nullopt;
    return 100.0*static_cast<double>(total-idle)/static_cast<double>(total);
}
inline double Percent(double used,double total){return total>0.0?std::clamp(100.0*used/total,0.0,100.0):0.0;}
// First aggregate all process contributions to the same physical engine.
// Only then take the busiest engine; never sum percentages across engines.
inline double BusiestEngine(const std::map<std::string,double>& engines) {
    double result=0.0;for(const auto& [id,value]:engines){(void)id;if(std::isfinite(value))result=std::max(result,std::clamp(value,0.0,100.0));}return result;
}
inline std::string StableHash(const std::string& value) {
    std::uint64_t hash=14695981039346656037ull;
    for(unsigned char c:value){hash^=c;hash*=1099511628211ull;}
    constexpr char hex[]="0123456789abcdef";std::string out(16,'0');
    for(int i=15;i>=0;--i){out[static_cast<std::size_t>(i)]=hex[hash&15];hash>>=4;}return out;
}
}
