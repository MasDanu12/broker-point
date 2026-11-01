window.BrokerAuthReady = (async function () {
  const token = sessionStorage.getItem("bp_token");

  if (!token) {
    window.location.replace("/login.html");
    return null;
  }

  try {
    const response = await fetch("/api/auth/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      },
      cache: "no-store"
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success || !result.user) {
      throw new Error("Sesi tidak valid.");
    }

    sessionStorage.setItem("bp_user", JSON.stringify(result.user));

    document.documentElement.dataset.authenticated = "true";

    return result.user;
  } catch (error) {
    sessionStorage.removeItem("bp_token");
    sessionStorage.removeItem("bp_user");

    window.location.replace("/login.html");
    return null;
  }
})();
