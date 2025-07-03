#include <iostream>
#include <string>
#include <curl/curl.h>

// Callback to capture server response into a std::string
static size_t WriteCallback(void* contents, size_t size, size_t nmemb, void* userp) {
    std::string* resp = static_cast<std::string*>(userp);
    resp->append(static_cast<char*>(contents), size * nmemb);
    return size * nmemb;
}

// Progress callback: shows upload percentage
static int ProgressCallback(void* /*clientp*/,
                            curl_off_t /*dltotal*/, curl_off_t /*dlnow*/,
                            curl_off_t ultotal, curl_off_t ulnow) {
    if (ultotal > 0) {
        double fraction = (double)ulnow / (double)ultotal;
        int percent = static_cast<int>(fraction * 100);
        std::cout << "\rUploading: " << percent << "% " << std::flush;
    }
    return 0;  // return non-zero to abort transfer
}

int main() {
    const std::string file_path = "/home/scv/Telegram Desktop/photo_2025-06-01_22-25-22.jpg";
    // const std::string file_path = "/home/scv/Telegram Desktop/News1.mp4";
    const std::string bearer_token = "bdb57bee241dc7a25dc383bb4b78888dc84db1453ae7996fd915cab5dd56ce14";
    const std::string url = "https://letovocorp.ru/upload/";

    CURL* curl = curl_easy_init();
    if (!curl) {
        std::cerr << "Failed to initialize libcurl\n";
        return 1;
    }

    // Build Authorization header
    struct curl_slist* headers = nullptr;
    headers = curl_slist_append(headers, ("Bearer: " + bearer_token).c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);

    // Set URL
    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());

    // Enable progress meter and set our callback
    curl_easy_setopt(curl, CURLOPT_NOPROGRESS, 0L);
#if LIBCURL_VERSION_NUM >= 0x072000 // curl >= 7.32.0
    curl_easy_setopt(curl, CURLOPT_XFERINFOFUNCTION, ProgressCallback);
    curl_easy_setopt(curl, CURLOPT_XFERINFODATA, nullptr);
#else
    curl_easy_setopt(curl, CURLOPT_PROGRESSFUNCTION, ProgressCallback);
    curl_easy_setopt(curl, CURLOPT_PROGRESSDATA, nullptr);
#endif

    // Build the multipart form
    curl_mime* mime = curl_mime_init(curl);
    curl_mimepart* part = curl_mime_addpart(mime);
    curl_mime_name(part, "file");
    curl_mime_filedata(part, file_path.c_str());
    curl_easy_setopt(curl, CURLOPT_MIMEPOST, mime);

    // Capture response body
    std::string response_body;
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response_body);

    // Perform the request
    CURLcode res = curl_easy_perform(curl);
    std::cout << "\rUploading: 100%         \n";  // ensure we end the line

    if (res != CURLE_OK) {
        std::cerr << "Upload failed: " << curl_easy_strerror(res) << "\n";
    } else {
        long response_code = 0;
        curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &response_code);
        std::cout << "HTTP Status: " << response_code << "\n";
        std::cout << "Response body:\n"
                  << response_body << "\n";
    }

    // Clean up
    curl_slist_free_all(headers);
    curl_mime_free(mime);
    curl_easy_cleanup(curl);

    return 0;
}
