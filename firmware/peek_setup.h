// Helpers for peek-frame.yaml: finding Peek on the home network.
#pragma once

#include <string>

#include "esp_netif.h"
#include "esphome/core/log.h"
#include "mdns.h"

namespace peek {

// Turns what someone typed ("192.168.1.20", "nas.local:8080/") into a base
// address like "http://192.168.1.20:8080", or "" if nothing was typed.
inline std::string normalize_address(std::string address) {
  const char *space = " \t\r\n";
  address.erase(0, address.find_first_not_of(space));
  address.erase(address.find_last_not_of(space) + 1);
  if (address.empty())
    return "";
  if (address.find("://") == std::string::npos)
    address = "http://" + address;
  while (address.back() == '/')
    address.pop_back();
  size_t host = address.find("://") + 3;
  if (address.find(':', host) == std::string::npos && address.find('/', host) == std::string::npos)
    address += ":8080";  // Peek's own port
  return address;
}

// Asks the network for Peek's announcement (mDNS "_peek._tcp"). Returns its
// base address, or "" when nothing answers.
inline std::string find_peek() {
  mdns_result_t *results = nullptr;
  if (mdns_query_ptr("_peek", "_tcp", 2000, 1, &results) != ESP_OK || results == nullptr) {
    ESP_LOGI("peek", "Peek didn't answer on the network");
    return "";
  }
  std::string found;
  for (mdns_ip_addr_t *a = results->addr; a != nullptr; a = a->next) {
    if (a->addr.type == ESP_IPADDR_TYPE_V4) {
      char ip[16];
      esp_ip4addr_ntoa(&a->addr.u_addr.ip4, ip, sizeof(ip));
      found = std::string("http://") + ip + ":" + std::to_string(results->port);
      break;
    }
  }
  mdns_query_results_free(results);
  ESP_LOGI("peek", "Found Peek at %s", found.c_str());
  return found;
}

}  // namespace peek
