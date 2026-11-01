const $ = (id) => document.getElementById(id);

function setConnection(status, label) {
  const element = $("connectionStatus");
  element.className = `connection-status ${status}`;
  element.innerHTML = `<i></i> ${label}`;
}

function extractRecords(result) {
  if (Array.isArray(result)) return result;

  for (const key of ["data", "items", "results", "records"]) {
    if (Array.isArray(result?.[key])) return result[key];
  }

  return [];
}

function setCount(id, value) {
  $(id).textContent = Number.isFinite(value)
    ? value.toLocaleString("id-ID")
    : "—";
}

async function loadDashboard() {
  $("dataNote").textContent = "Mengambil data dari database...";
  $("refreshButton").disabled = true;

  try {
    const results = await Promise.allSettled([
      BrokerAPI.get("/api/factories"),
      BrokerAPI.get("/api/workers"),
      BrokerAPI.get("/api/models")
    ]);

    const labels = [
      ["factoryCount", "pabrik"],
      ["workerCount", "penjahit"],
      ["modelCount", "model"]
    ];

    let successCount = 0;
    const failed = [];

    results.forEach((result, index) => {
      const [elementId, label] = labels[index];

      if (result.status === "fulfilled") {
        const records = extractRecords(result.value);
        setCount(elementId, records.length);
        successCount++;
      } else {
        setCount(elementId, NaN);
        failed.push(label);
      }
    });

    if (successCount === 3) {
      $("dataNote").textContent =
        "Seluruh ringkasan berhasil diperbarui dari database.";
      setConnection("online", "Server terhubung");
    } else if (successCount > 0) {
      $("dataNote").textContent =
        `Sebagian data belum tersedia: ${failed.join(", ")}. Periksa modul API terkait.`;
      setConnection("online", "Server terhubung sebagian");
    } else {
      $("dataNote").textContent =
        "Data belum berhasil dimuat. Periksa koneksi dan modul API.";
      setConnection("offline", "Data tidak tersedia");
    }
  } catch (error) {
    $("dataNote").textContent = error.message;
    setConnection("offline", "Koneksi bermasalah");
  } finally {
    $("refreshButton").disabled = false;
  }
}

function initializeDashboard() {
  const userText = sessionStorage.getItem("bp_user");

  if (userText) {
    try {
      const user = JSON.parse(userText);
      $("adminName").textContent = user.username || "Administrator";
      $("avatar").textContent = (user.username || "A").charAt(0).toUpperCase();
    } catch {
      $("adminName").textContent = "Administrator";
    }
  }

  $("todayDate").textContent = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date());

  $("refreshButton").addEventListener("click", loadDashboard);

  $("logoutButton").addEventListener("click", () => {
    BrokerAPI.logout();
  });

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".nav-link").forEach((item) => {
        item.classList.remove("active");
      });
      link.classList.add("active");
    });
  });

  loadDashboard();
}

window.BrokerAuthReady.then((user) => {
  if (user) initializeDashboard();
});
