window.BrokerAPI = {
  async request(path, options = {}) {
    if (!path.startsWith("/api/")) {
      throw new Error("Alamat API tidak valid.");
    }

    const user = await window.BrokerAuthReady;

    if (!user) {
      throw new Error("Sesi tidak tersedia. Silakan login kembali.");
    }

    const token = sessionStorage.getItem("bp_token");

    if (!token) {
      window.location.replace("/login.html");
      throw new Error("Sesi login tidak ditemukan.");
    }

    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);

    if (
      options.body &&
      typeof options.body === "string" &&
      !headers.has("Content-Type")
    ) {
      headers.set("Content-Type", "application/json");
    }

    let response;

    try {
      response = await fetch(path, {
        ...options,
        headers,
        cache: "no-store"
      });
    } catch {
      throw new Error("Koneksi ke server gagal. Periksa jaringan internet.");
    }

    if (response.status === 401) {
      sessionStorage.removeItem("bp_token");
      sessionStorage.removeItem("bp_user");
      window.location.replace("/login.html");
      throw new Error("Sesi berakhir. Silakan login kembali.");
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      throw new Error("Server mengirim respons yang tidak dikenali.");
    }

    const result = await response.json();

    if (!response.ok || result.success === false) {
      throw new Error(result.message || "Permintaan gagal.");
    }

    return result;
  },

  get(path) {
    return this.request(path, { method: "GET" });
  },

  post(path, data) {
    return this.request(path, {
      method: "POST",
      body: JSON.stringify(data)
    });
  },

  put(path, data) {
    return this.request(path, {
      method: "PUT",
      body: JSON.stringify(data)
    });
  },

  patch(path, data) {
    return this.request(path, {
      method: "PATCH",
      body: JSON.stringify(data)
    });
  },

  delete(path) {
    return this.request(path, { method: "DELETE" });
  },

  async logout() {
    const token = sessionStorage.getItem("bp_token");

    try {
      if (token) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`
          },
          cache: "no-store"
        });
      }
    } finally {
      sessionStorage.removeItem("bp_token");
      sessionStorage.removeItem("bp_user");
      window.location.replace("/login.html");
    }
  }
};
