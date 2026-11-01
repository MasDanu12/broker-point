const form = document.getElementById("loginForm");
const message = document.getElementById("message");
const button = document.getElementById("loginButton");
const buttonText = document.getElementById("buttonText");

function showMessage(text, type = "error") {
  message.textContent = text;
  message.className = type === "success"
    ? "message success"
    : "message";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  showMessage("");
  button.disabled = true;
  buttonText.textContent = "Memeriksa akun...";

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success || !result.token) {
      throw new Error(result.message || "Login gagal.");
    }

    sessionStorage.setItem("bp_token", result.token);
    sessionStorage.setItem("bp_user", JSON.stringify(result.user));

    showMessage("Login berhasil. Membuka aplikasi...", "success");

    window.location.replace("/");
  } catch (error) {
    showMessage(error.message || "Tidak dapat terhubung ke server.");
  } finally {
    button.disabled = false;
    buttonText.textContent = "Masuk ke aplikasi";
  }
});
