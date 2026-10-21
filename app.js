(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const MONTHS = ["Th1", "Th2", "Th3", "Th4", "Th5", "Th6", "Th7", "Th8", "Th9", "Th10", "Th11", "Th12"];
  const COLORS = {
    cyan: "#00e5ff",
    muted: "#8b90b8",
    purple: "#7c5cff",
    pink: "#ff3d81",
    grid: "rgba(255,255,255,.09)"
  };
  const PADDING = { left: 48, right: 12, top: 16, bottom: 30 };
  let records = makeDemoData();
  let scene3d = null;

  
  function format(value) {
    return Number.isFinite(value)
        ? new Intl.NumberFormat("vi-VN", {
            maximumFractionDigits: 0
          }).format(value)
        : "—";
  }


  function average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  function makeDemoData() {
    let random = 7;
    let price = 100;
    const data = [];
    for (let day = new Date(2025, 0, 1); day < new Date(2026, 0, 1); day.setDate(day.getDate() + 1)) {
      if (day.getDay() === 0 || day.getDay() === 6) continue;
      random = (random * 16807) % 2147483647;
      price *= 1 + (random / 2147483647 - 0.47) * 0.03;
      data.push({ date: new Date(day), close: price });
    }
    return data;
  }

  function parseCsv(text) {
    const firstLine = text.split(/\r?\n/, 1)[0] || "";
    const delimiter = [",", ";", "\t"].sort((a, b) =>
      countOutsideQuotes(firstLine, b) - countOutsideQuotes(firstLine, a)
    )[0];
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === delimiter && !quoted) {
        row.push(field);
        field = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[i + 1] === "\n") i += 1;
        row.push(field);
        if (row.some((cell) => cell.trim())) rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }

    if (field.length || row.length) {
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
    }
    if (quoted) throw new Error("CSV có dấu ngoặc kép chưa được đóng.");
    if (rows.length < 2) throw new Error("CSV cần có hàng tiêu đề và ít nhất một dòng dữ liệu.");

    const headers = rows[0].map((value) => value.replace(/^\uFEFF/, "").trim().toLocaleLowerCase("vi"));
    const numericFirstRow = rows[0].map(parseNumber);
    if (numericFirstRow.length === 7 && numericFirstRow.every(Number.isFinite)) {
      return parseHeaderlessOhlc(rows);
    }

    const dateIndex = headers.findIndex((value) => value === "date" || value.includes("ngày") || value.includes("time"));
    const closeIndex = headers.findIndex((value) =>
      value === "close" || value.includes("đóng") || value.includes("close price") || value === "price"
    );
    if (dateIndex < 0 || closeIndex < 0) {
      throw new Error("Không nhận diện được định dạng CSV. Cần cột Date và Close, hoặc 7 cột số theo thứ tự Giá sàn, tham chiếu, trần, mở cửa, đóng cửa, cao nhất, thấp nhất.");
    }

    const parsed = rows.slice(1).map((cells, index) => {
      const date = parseDate(cells[dateIndex] || "");
      const close = parseNumber(cells[closeIndex] || "");
      if (!date || !Number.isFinite(close)) {
        throw new Error(`Dữ liệu không hợp lệ tại dòng ${index + 2}. Kiểm tra ngày và giá đóng cửa.`);
      }
      return { date, close };
    }).sort((a, b) => a.date - b.date);

    if (!parsed.length) throw new Error("CSV không có dữ liệu hợp lệ.");
    return parsed;
  }

  function parseHeaderlessOhlc(rows) {
    const startDate = new Date(2025, 0, 1);
    return rows.map((cells, index) => {
      if (cells.length !== 7) {
        throw new Error(`Dòng ${index + 1} cần có đúng 7 cột số (sàn, tham chiếu, trần, mở cửa, đóng cửa, cao nhất, thấp nhất).`);
      }
      const values = cells.map(parseNumber);
      if (!values.every(Number.isFinite)) {
        throw new Error(`Dữ liệu không phải số tại dòng ${index + 1}.`);
      }
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + index);
      return { date, close: values[4] };
    });
  }

  function countOutsideQuotes(text, delimiter) {
    let quoted = false;
    let count = 0;
    for (const char of text) {
      if (char === '"') quoted = !quoted;
      else if (char === delimiter && !quoted) count += 1;
    }
    return count;
  }

  function parseDate(value) {
    const input = value.trim().replace(/^"|"$/g, "");
    const local = input.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/);
    if (local) {
      const [, first, second, year] = local;
      const dayFirst = Number(first) > 12 || Number(second) <= 12;
      const day = Number(dayFirst ? first : second);
      const month = Number(dayFirst ? second : first);
      const date = new Date(Number(year), month - 1, day);
      return date.getFullYear() === Number(year) && date.getMonth() === month - 1 && date.getDate() === day
        ? date
        : null;
    }
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  
  
  function parseNumber(value) {
    let input = String(value ?? "")
        .trim()
        .replace(/^"|"$/g, "")
        .replace(/\s/g, "")
        .replace(/[₫$€]/g, "");

    if (!input) return NaN;

    if (input.includes(",") && input.includes(".")) {
        // 20.787,5 -> 20787.5
        // 20,787.5 -> 20787.5
        if (input.lastIndexOf(",") > input.lastIndexOf(".")) {
            input = input.replace(/\./g, "").replace(",", ".");
        } else {
            input = input.replace(/,/g, "");
        }
    } else if (input.includes(",")) {
        // 14,7 -> 14.7
        // 20,787 -> 20787
        if (/^-?\d{1,3}(,\d{3})+$/.test(input)) {
            input = input.replace(/,/g, "");
        } else {
            input = input.replace(",", ".");
        }
    } else if (input.includes(".")) {
        // 20.787 -> 20787
        // 1.234.567 -> 1234567
        if (/^-?\d{1,3}(\.\d{3})+$/.test(input)) {
            input = input.replace(/\./g, "");
        }
    }

    return Number(input);
  }



  function quantile(values, proportion) {
    const sorted = [...values].sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const index = (sorted.length - 1) * proportion;
    const lower = Math.floor(index);
    return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * (index - lower);
  }

  function groupedByMonth() {
    const groups = new Map();
    records.forEach((record) => {
      const key = `${record.date.getFullYear()}-${record.date.getMonth()}`;
      if (!groups.has(key)) groups.set(key, { label: `${MONTHS[record.date.getMonth()]} '${String(record.date.getFullYear()).slice(-2)}`, values: [] });
      groups.get(key).values.push(record.close);
    });
    return [...groups.values()];
  }

  function canvasContext(selector) {
    const canvas = $(selector);
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.width = rect.width;
    context.height = rect.height;
    context.clearRect(0, 0, rect.width, rect.height);
    return context;
  }

  function yPosition(context, value, low, high) {
    const range = high - low || 1;
    return PADDING.top + (context.height - PADDING.top - PADDING.bottom) * (1 - (value - low) / range);
  }

  function drawAxes(context, low, high, labels) {
    const { left, right, top, bottom } = PADDING;
    const plotHeight = context.height - top - bottom;
    context.font = "11px Segoe UI, sans-serif";
    context.fillStyle = COLORS.muted;
    context.strokeStyle = COLORS.grid;
    context.textAlign = "right";
    for (let i = 0; i <= 4; i += 1) {
      const y = top + plotHeight * i / 4;
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(context.width - right, y);
      context.stroke();
      context.fillText(format(high - (high - low) * i / 4), left - 7, y + 4);
    }

    const visibleLabels = Math.max(1, Math.floor((context.width - left - right) / 76));
    const step = Math.max(1, Math.ceil(labels.length / visibleLabels));
    context.textAlign = "center";
    labels.forEach((label, index) => {
      if (index % step === 0 || index === labels.length - 1) {
        const x = left + (context.width - left - right) * (index + 0.5) / Math.max(labels.length, 1);
        context.fillText(label, x, context.height - 8);
      }
    });
  }

  function drawLine(selector, values, labels, includeTrend = false) {
    const context = canvasContext(selector);
    if (!values.length) return;
    let low = Math.min(...values);
    let high = Math.max(...values);
    const padding = (high - low || Math.abs(high) * 0.04 || 1) * 0.08;
    low -= padding;
    high += padding;
    drawAxes(context, low, high, labels);

    const point = (index) => [
      PADDING.left + (context.width - PADDING.left - PADDING.right) * index / Math.max(values.length - 1, 1),
      yPosition(context, values[index], low, high)
    ];
    const gradient = context.createLinearGradient(0, PADDING.top, 0, context.height - PADDING.bottom);
    gradient.addColorStop(0, "rgba(0, 229, 255, .2)");
    gradient.addColorStop(1, "rgba(0, 229, 255, 0)");

    context.beginPath();
    values.forEach((value, index) => {
      const [x, y] = point(index);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.lineTo(point(values.length - 1)[0], context.height - PADDING.bottom);
    context.lineTo(point(0)[0], context.height - PADDING.bottom);
    context.closePath();
    context.fillStyle = gradient;
    context.fill();

    context.beginPath();
    values.forEach((value, index) => {
      const [x, y] = point(index);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = COLORS.cyan;
    context.lineWidth = 2;
    context.shadowColor = COLORS.cyan;
    context.shadowBlur = 10;
    context.stroke();
    context.shadowBlur = 0;

    if (includeTrend && values.length > 1) {
      const { slope, intercept } = regression(values);
      context.beginPath();
      context.setLineDash([7, 6]);
      context.moveTo(PADDING.left, yPosition(context, intercept, low, high));
      context.lineTo(context.width - PADDING.right, yPosition(context, intercept + slope * (values.length - 1), low, high));
      context.strokeStyle = COLORS.pink;
      context.lineWidth = 2;
      context.stroke();
      context.setLineDash([]);
    }
  }

  function drawBoxplots(selector, groups, color, sharedRange) {
    const context = canvasContext(selector);
    const values = groups.flatMap((group) => group.values);
    if (!values.length) return;
    const low = sharedRange ? sharedRange[0] : Math.min(...values);
    const high = sharedRange ? sharedRange[1] : Math.max(...values);
    drawAxes(context, low, high, groups.map((group) => group.label));
    const slot = (context.width - PADDING.left - PADDING.right) / groups.length;

    groups.forEach((group, index) => {
      const numbers = group.values;
      if (!numbers.length) return;
      const center = PADDING.left + slot * (index + 0.5);
      const boxWidth = Math.min(slot * 0.48, 38);
      const min = Math.min(...numbers);
      const max = Math.max(...numbers);
      const first = quantile(numbers, 0.25);
      const median = quantile(numbers, 0.5);
      const third = quantile(numbers, 0.75);
      const firstY = yPosition(context, first, low, high);
      const thirdY = yPosition(context, third, low, high);

      context.strokeStyle = color;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(center, yPosition(context, min, low, high));
      context.lineTo(center, yPosition(context, max, low, high));
      context.stroke();
      context.fillStyle = `${color}55`;
      context.shadowColor = color;
      context.shadowBlur = 12;
      context.fillRect(center - boxWidth / 2, thirdY, boxWidth, Math.max(2, firstY - thirdY));
      context.shadowBlur = 0;
      context.strokeStyle = "#fff";
      context.beginPath();
      context.moveTo(center - boxWidth / 2, yPosition(context, median, low, high));
      context.lineTo(center + boxWidth / 2, yPosition(context, median, low, high));
      context.stroke();
    });
  }

  function regression(values) {
    const meanX = (values.length - 1) / 2;
    const meanY = average(values);
    let numerator = 0;
    let denominator = 0;
    values.forEach((value, index) => {
      numerator += (index - meanX) * (value - meanY);
      denominator += (index - meanX) ** 2;
    });
    const slope = denominator ? numerator / denominator : 0;
    return { slope, intercept: meanY - slope * meanX };
  }

  function renderKpis(values) {
    const first = values[0];
    const last = values[values.length - 1];
    const change = first ? (last / first - 1) * 100 : 0;
    const items = [
      ["Số phiên", format(values.length)],
      ["Giá đầu kỳ", format(first)],
      ["Giá cuối kỳ", format(last)],
      ["Cao nhất", format(Math.max(...values))],
      ["Thấp nhất", format(Math.min(...values))],
      ["Biến động", `${change > 0 ? "+" : ""}${format(change)}%`]
    ];
    $("#kpi").innerHTML = items.map(([label, value]) =>
      `<div class="card kpi"><strong>${value}</strong><span>${label}</span></div>`
    ).join("");
  }

  function renderInsights(months, values) {
    const monthAverages = months.map((month) => average(month.values));
    const highest = monthAverages.indexOf(Math.max(...monthAverages));
    const lowest = monthAverages.indexOf(Math.min(...monthAverages));
    const widest = months.reduce((best, month, index) => {
      const range = Math.max(...month.values) - Math.min(...month.values);
      return range > best.range ? { index, range } : best;
    }, { index: 0, range: -Infinity });
    const difference = monthAverages[lowest] ? (monthAverages[highest] / monthAverages[lowest] - 1) * 100 : 0;

    $("#monthly-note").innerHTML = `<strong>Nhận xét:</strong> Tháng có giá trung bình cao nhất là <strong>${months[highest].label}</strong> (${format(monthAverages[highest])}); thấp nhất là <strong>${months[lowest].label}</strong> (${format(monthAverages[lowest])}), chênh lệch ${format(Math.abs(difference))}%. Biên độ giá lớn nhất thuộc <strong>${months[widest.index].label}</strong>.`;

    const quarters = [[], [], [], []];
    records.forEach((record) => quarters[Math.floor(record.date.getMonth() / 3)].push(record.close));
    const firstHalf = quarters[0].concat(quarters[1]);
    const secondHalf = quarters[2].concat(quarters[3]);
    const standardDeviation = (items) => {
      if (!items.length) return 0;
      const mean = average(items);
      return Math.sqrt(average(items.map((value) => (value - mean) ** 2)));
    };
    const firstAverage = average(firstHalf);
    const secondAverage = average(secondHalf);
    const halfDifference = firstAverage ? Math.abs(secondAverage / firstAverage - 1) * 100 : 0;
    const firstDeviation = standardDeviation(firstHalf);
    const secondDeviation = standardDeviation(secondHalf);
    const stability = secondDeviation > firstDeviation ? "dao động mạnh hơn" : "ổn định hơn";
    $("#quarterly-note").innerHTML = `<strong>So sánh:</strong> Hai quý đầu có giá trung bình <strong>${format(firstAverage)}</strong> (trung vị ${format(quantile(firstHalf, 0.5))}, độ lệch chuẩn ${format(firstDeviation)}); hai quý cuối có giá trung bình <strong>${format(secondAverage)}</strong> (trung vị ${format(quantile(secondHalf, 0.5))}, độ lệch chuẩn ${format(secondDeviation)}). Nửa năm sau ${secondAverage >= firstAverage ? "cao hơn" : "thấp hơn"} ${format(halfDifference)}% và ${stability}.`;

    const change = values[0] ? (values[values.length - 1] / values[0] - 1) * 100 : 0;
    const { slope } = regression(values);
    const direction = Math.abs(change) < 3 ? "đi ngang" : slope > 0 ? "tăng" : "giảm";
    $("#trend-note").innerHTML = `<strong>Đánh giá xu hướng:</strong> Giá đi từ ${format(values[0])} đến ${format(values[values.length - 1])} (${change > 0 ? "+" : ""}${format(change)}%). Đường hồi quy có độ dốc ${format(slope)}/phiên, xu hướng tổng thể là <strong>${direction}</strong>. Đỉnh ${format(Math.max(...values))}, đáy ${format(Math.min(...values))}.`;
    return quarters;
  }

  function render() {
    if (!records.length) return;
    const closes = records.map((record) => record.close);
    const months = groupedByMonth();
    const dateLabels = records.map((record) => record.date.toLocaleDateString("vi-VN", { month: "short" }));
    const quarterGroups = renderInsights(months, closes);
    const allValues = [...closes];
    const range = [Math.min(...allValues) * 0.98, Math.max(...allValues) * 1.02];

    renderKpis(closes);
    drawLine("#chart-overview", closes, dateLabels);
    drawBoxplots("#chart-boxplot", months, COLORS.purple);
    drawLine("#chart-monthly-average", months.map((month) => average(month.values)), months.map((month) => month.label));
    drawBoxplots("#chart-quarter-first", [
      { label: "Quý 1", values: quarterGroups[0] },
      { label: "Quý 2", values: quarterGroups[1] }
    ], COLORS.cyan, range);
    drawBoxplots("#chart-quarter-last", [
      { label: "Quý 3", values: quarterGroups[2] },
      { label: "Quý 4", values: quarterGroups[3] }
    ], COLORS.pink, range);
    drawLine("#chart-trend", closes, dateLabels, true);
    render3d(months, closes);
  }

  function showFileStatus(message, isError = false) {
    const status = $("#file-status");
    status.textContent = message;
    status.style.color = isError ? "#ff8aaa" : "";
  }

  async function loadBundledCsv() {
    try {
      const response = await fetch("./data/abc-13.csv");
      if (!response.ok) {
        throw new Error(`Không thể tải CSV (HTTP ${response.status}).`);
      }
      const nextRecords = parseCsv(await response.text());
      records = nextRecords;
      render();
      showFileStatus(`Đang dùng dữ liệu CSV có sẵn (${records.length} phiên).`);
    } catch (error) {
      showFileStatus(
        `Không tải được static/data/abc-13.csv; đang dùng dữ liệu mẫu. ${error instanceof Error ? error.message : ""}`,
        true
      );
    }
  }

  $("#csv-file").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const content = await file.text();
      const nextRecords = parseCsv(content);
      records = nextRecords;
      render();
      showFileStatus(`Đang dùng dữ liệu từ ${file.name} (${records.length} phiên).`);
    } catch (error) {
      showFileStatus(error instanceof Error ? error.message : "Không thể đọc file CSV.", true);
    } finally {
      event.target.value = "";
    }
  });

  function initReveal() {
    const elements = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    elements.forEach((element) => observer.observe(element));
  }

  function init3d() {
    if (!window.THREE) return;
    const canvas = $("#gl");
    try {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x05060f, 0.026);
      const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
      camera.position.set(0, 6, 26);
      const group = new THREE.Group();
      scene.add(group);
      scene.add(new THREE.AmbientLight(0x6666aa, 0.7));
      const purpleLight = new THREE.PointLight(0x7c5cff, 2, 80);
      purpleLight.position.set(10, 15, 15);
      scene.add(purpleLight);
      const cyanLight = new THREE.PointLight(0x00e5ff, 2, 80);
      cyanLight.position.set(-15, 5, 10);
      scene.add(cyanLight);
      const grid = new THREE.GridHelper(120, 60, 0x7c5cff, 0x1a1c3a);
      grid.position.y = -6;
      scene.add(grid);

      const resize = () => {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
      };
      resize();
      window.addEventListener("resize", resize);
      scene3d = { renderer, scene, camera, group, grid, bars: [], resize, tick: 0 };
      requestAnimationFrame(animate3d);
    } catch (error) {
      console.warn("3D background unavailable; using the CSS background.", error);
    }
  }

  function render3d(months, closes) {
    if (!scene3d) return;
    const { group, bars } = scene3d;
    while (group.children.length) {
      const child = group.children[group.children.length - 1];
      group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
    bars.length = 0;
    const averages = months.map((month) => average(month.values));
    if (!averages.length) return;
    const low = Math.min(...averages);
    const high = Math.max(...averages);
    averages.forEach((value, index) => {
      const height = 2 + (value - low) / (high - low || 1) * 10;
      const hue = 0.72 - index / Math.max(averages.length, 1) * 0.5;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, height, 1.4),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(hue, 0.9, 0.55),
          emissive: new THREE.Color().setHSL(hue, 1, 0.2),
          metalness: 0.55,
          roughness: 0.28
        })
      );
      mesh.position.set((index - (averages.length - 1) / 2) * 2.2, height / 2 - 6, 0);
      mesh.userData.height = height;
      mesh.scale.y = 0.01;
      group.add(mesh);
      bars.push(mesh);
    });

    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const points = closes.map((value, index) => new THREE.Vector3(
      (index / Math.max(closes.length - 1, 1) - 0.5) * averages.length * 2.2,
      (value - min) / (max - min || 1) * 10 - 5,
      3
    ));
    group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: 0x00e5ff })
    ));
  }

  function animate3d() {
    if (!scene3d) return;
    const { renderer, scene, camera, group, grid, bars } = scene3d;
    scene3d.tick += 0.01;
    const scroll = window.scrollY / Math.max(1, document.body.scrollHeight - window.innerHeight);
    group.rotation.y = scroll * Math.PI * 2 + Math.sin(scene3d.tick) * 0.08;
    group.position.y = -scroll * 4;
    camera.position.z = 26 - scroll * 6;
    grid.position.z = (scene3d.tick * 8) % 2;
    bars.forEach((bar) => {
      bar.scale.y += (1 - bar.scale.y) * 0.045;
      bar.position.y = bar.userData.height * bar.scale.y / 2 - 6;
    });
    renderer.render(scene, camera);
    requestAnimationFrame(animate3d);
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(render, 120);
  });
  initReveal();
  init3d();
  render();
  loadBundledCsv();
})();
