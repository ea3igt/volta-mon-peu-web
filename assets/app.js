import * as d3 from "https://esm.sh/d3@7.9.0";
import world from "https://esm.sh/@d3-maps/atlas@1.0.0/world/countries/countries-110m";
import { feature } from "https://esm.sh/topojson-client@3.1.0";

const number0 = new Intl.NumberFormat("ca-ES", { maximumFractionDigits: 0 });
const number1 = new Intl.NumberFormat("ca-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const number2 = new Intl.NumberFormat("ca-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat("ca-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const shortDateFormatter = new Intl.DateTimeFormat("ca-ES", { day: "numeric", month: "short", timeZone: "UTC" });
const cardinalLabels = {
  north: ["N", "Més al nord"],
  south: ["S", "Més al sud"],
  east: ["E", "Més a l’est"],
  west: ["O", "Més a l’oest"],
};

let stats;

function formatDate(value, short = false) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return (short ? shortDateFormatter : dateFormatter).format(date).replace(/\.$/, "");
}

function formatLocal(value, seconds = false) {
  if (!value) return "—";
  const [day, time] = value.split("T");
  return `${formatDate(day)} · ${time.slice(0, seconds ? 8 : 5)} h`;
}

function localInterval(event) {
  if (!event.local_time) return formatDate(event.date);
  const start = event.local_time.split("T")[1].slice(0, 8);
  const end = event.end_local_time?.split("T")[1].slice(0, 8);
  return `${formatDate(event.date)} · ${start}${end && end !== start ? ` — ${end}` : ""} h`;
}

function coordinates(record) {
  const lat = `${number1.format(Math.abs(record.lat))}° ${record.lat >= 0 ? "N" : "S"}`;
  const lon = `${number1.format(Math.abs(record.lon))}° ${record.lon >= 0 ? "E" : "O"}`;
  return `${lat} · ${lon}`;
}

function coordinatesPrecise(record) {
  const lat = `${Math.abs(record.lat).toLocaleString("ca-ES", { minimumFractionDigits: 5, maximumFractionDigits: 5 })}° ${record.lat >= 0 ? "N" : "S"}`;
  const lon = `${Math.abs(record.lon).toLocaleString("ca-ES", { minimumFractionDigits: 5, maximumFractionDigits: 5 })}° ${record.lon >= 0 ? "E" : "O"}`;
  return `${lat} · ${lon}`;
}

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function detailItem(label, value, context = "", meta = "") {
  const item = document.createElement("div");
  item.innerHTML = `<dt>${label}</dt><dd>${value}</dd>${context ? `<span>${context}</span>` : ""}${meta ? `<span>${meta}</span>` : ""}`;
  return item;
}

function renderTextContent() {
  const { summary, meta } = stats;
  setText("update-status", `Dades disponibles fins al ${formatDate(meta.data_as_of)} · actualització automàtica diària`);
  setText("footer-update", `Darrera activitat incorporada: ${formatDate(meta.data_as_of)}.`);
  setText("journey-period", `${formatDate(summary.first_date)} — ${formatDate(summary.last_date)}`);
  setText("total-km", `${number1.format(summary.total_km)} km`);
  setText("route-ratio", `${number2.format(summary.route_ratio)}× la distància en línia recta · ${number1.format(summary.straight_km)} km`);
  setText("walking-days", `${number0.format(summary.walking_days)} de ${number0.format(summary.natural_days)}`);
  setText("walking-average", `${number1.format(summary.walking_average_km)} km per dia caminant`);
  setText("territories", number0.format(summary.territories));
  setText("track-count", `${number0.format(summary.tracks)} tracks GPX`);
  setText("natural-average", `${number1.format(summary.natural_average_km)} km per dia natural`);
}

function renderMilestones() {
  const { milestones, summary } = stats;
  const speed = milestones.speed_max_5min;
  const altitude = milestones.altitude_max;
  const items = [
    ["Etapa més llarga", `${number1.format(milestones.longest_stage.km)} km`, `${formatDate(milestones.longest_stage.date, true)} · ${milestones.longest_stage.country}`],
    ["Ratxa més llarga", `${milestones.longest_streak.days} dies`, `${formatDate(milestones.longest_streak.start, true)} — ${formatDate(milestones.longest_streak.end)}`],
    ["Velocitat màxima", `${number1.format(speed.value)} km/h`, `finestra sostinguda de 5 min · ${formatDate(speed.date, true)} · ${speed.country}`],
    ["Altitud màxima", `${number0.format(altitude.value)} m`, `${formatDate(altitude.date, true)} · ${altitude.country}`],
    ["Desnivell positiu", `≈${number0.format(milestones.elevation_gain_m)} m`, "estimació calculada a partir dels GPX"],
    ["Dia amb més desnivell positiu", `≈${number0.format(milestones.elevation_gain_max_day.m)} m`, `${formatDate(milestones.elevation_gain_max_day.date)} · ${milestones.elevation_gain_max_day.countries.join(" · ")}`],
    ["Pausa més llarga", `${milestones.longest_pause.days} dies`, `${formatDate(milestones.longest_pause.start, true)} — ${formatDate(milestones.longest_pause.end)}`],
    ["Ruta / línia recta", `${number2.format(summary.route_ratio)}×`, `${number0.format(summary.total_km)} vs. ${number0.format(summary.straight_km)} km`],
  ];
  const container = document.getElementById("milestone-grid");
  container.replaceChildren(...items.map(([label, value, context]) => detailItem(label, value, context)));
}

function renderDetails() {
  const geographic = document.getElementById("geographic-list");
  const geographicItems = Object.entries(cardinalLabels).map(([key, [, label]]) => {
    const record = stats.geographic_extremes[key];
    const mainValue = key === "north" || key === "south"
      ? `${Math.abs(record.lat).toLocaleString("ca-ES", { minimumFractionDigits: 5, maximumFractionDigits: 5 })}° ${record.lat >= 0 ? "N" : "S"}`
      : `${Math.abs(record.lon).toLocaleString("ca-ES", { minimumFractionDigits: 5, maximumFractionDigits: 5 })}° ${record.lon >= 0 ? "E" : "O"}`;
    return detailItem(label, mainValue, `${formatDate(record.date)} · ${record.place}`, coordinatesPrecise(record));
  });
  geographic.replaceChildren(...geographicItems);

  const temperature = document.getElementById("temperature-list");
  const temperatureItems = [];
  for (const event of stats.temperature.max_episodes) {
    temperatureItems.push(detailItem("Màxima", `${number0.format(stats.temperature.max)} °C`, localInterval(event), `${event.place} · ${coordinatesPrecise(event)}`));
  }
  stats.temperature.min_episodes.forEach((event, index) => {
    const label = stats.temperature.min_episodes.length > 1 ? `Mínima · episodi ${index + 1}` : "Mínima";
    temperatureItems.push(detailItem(label, `${number0.format(stats.temperature.min)} °C`, localInterval(event), `${event.place} · ${coordinatesPrecise(event)}`));
  });
  temperature.replaceChildren(...temperatureItems);

  const heart = document.getElementById("heart-list");
  const heartItems = [
    detailItem("Màxima", `${number0.format(stats.heart_rate.max.value)} bpm`, formatLocal(stats.heart_rate.max.local_time, true), `${stats.heart_rate.max.place} · ${coordinatesPrecise(stats.heart_rate.max)}`),
    detailItem("Mínima", `${number0.format(stats.heart_rate.min.value)} bpm`, formatLocal(stats.heart_rate.min.local_time, true), `${stats.heart_rate.min.place} · ${coordinatesPrecise(stats.heart_rate.min)}`),
    detailItem("Mitjana del sensor", `${number0.format(stats.heart_rate.average)} bpm`, "lectures vàlides del rastre"),
  ];
  heart.replaceChildren(...heartItems);

  const trace = document.getElementById("digital-list");
  trace.replaceChildren(
    detailItem("Posicions GPS", number0.format(stats.digital_trace.gps_points), `${number0.format(stats.summary.tracks)} tracks públics`),
    detailItem("Mostreig continu estimat", `${number0.format(stats.digital_trace.sampled_hours)} h`, `interval típic de ${number1.format(stats.digital_trace.typical_interval_seconds)} s`),
    detailItem("Període cobert", `${number0.format(stats.summary.natural_days)} dies`, `${formatDate(stats.summary.first_date)} — ${formatDate(stats.summary.last_date)}`),
  );
}

function renderCountries() {
  const maximum = Math.max(...stats.countries.map(item => item.km));
  const items = stats.countries.map(item => {
    const temperature = item.temperature_average == null ? "—" : `${number1.format(item.temperature_average)} °C`;
    const heartRate = item.heart_rate_average == null ? "—" : `${number0.format(item.heart_rate_average)} bpm`;
    const elevationGain = item.elevation_gain_m == null ? "—" : `≈${number0.format(item.elevation_gain_m)} m`;
    const row = document.createElement("tr");
    row.innerHTML = `
      <th class="country-name" scope="row">${item.name}</th>
      <td class="country-value">${temperature}</td>
      <td class="country-value">${heartRate}</td>
      <td class="country-value">${number0.format(item.days)}</td>
      <td class="country-bar-cell"><div class="country-bar" aria-hidden="true"><span style="width:${(item.km / maximum * 100).toFixed(2)}%"></span></div></td>
      <td class="country-value">${number1.format(item.km)} km</td>
      <td class="country-value">${elevationGain}</td>`;
    return row;
  });
  document.getElementById("country-list").replaceChildren(...items);
}

function showTooltip(tooltip, container, x, y, text) {
  tooltip.textContent = text;
  tooltip.style.visibility = "visible";
  tooltip.setAttribute("aria-hidden", "false");
  const left = Math.max(8, Math.min(container.clientWidth - tooltip.offsetWidth - 8, x - tooltip.offsetWidth / 2));
  const top = Math.max(8, y - tooltip.offsetHeight - 12);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideTooltip(tooltip) {
  tooltip.style.visibility = "hidden";
  tooltip.setAttribute("aria-hidden", "true");
}

function renderMap() {
  const element = document.getElementById("route-map");
  const container = element.closest(".map-wrap");
  const tooltip = document.getElementById("map-tooltip");
  const width = Math.max(320, Math.round(element.clientWidth));
  const height = width < 600 ? 330 : 440;
  const svg = d3.select(element).attr("viewBox", `0 0 ${width} ${height}`);
  svg.selectAll(":scope > :not(title):not(desc)").remove();

  const lineFeature = { type: "Feature", geometry: { type: "LineString", coordinates: stats.route } };
  const projection = d3.geoMercator().fitExtent([[28, 28], [width - 28, height - 30]], lineFeature);
  const path = d3.geoPath(projection);
  const countries = feature(world, world.objects.features).features;
  svg.selectAll("path.map-country").data(countries).join("path").attr("class", "map-country").attr("d", path);
  svg.append("path").datum(lineFeature).attr("class", "map-route").attr("d", path);

  const markers = Object.entries(cardinalLabels).map(([key, [short, label]]) => {
    const record = stats.geographic_extremes[key];
    return {
      kind: "extreme",
      label: short,
      coordinates: [record.lon, record.lat],
      tooltip: `${label} · ${formatDate(record.date)} · ${record.place} · ${coordinatesPrecise(record)}`,
    };
  });
  for (const event of stats.temperature.max_episodes) {
    markers.push({
      kind: "temperature",
      label: `${number0.format(stats.temperature.max)}°`,
      coordinates: [event.lon, event.lat],
      tooltip: `Màxima · ${number0.format(stats.temperature.max)} °C · ${localInterval(event)} · ${event.place}`,
    });
  }
  for (const event of stats.temperature.min_episodes) {
    markers.push({
      kind: "temperature",
      label: `${number0.format(stats.temperature.min)}°`,
      coordinates: [event.lon, event.lat],
      tooltip: `Mínima · ${number0.format(stats.temperature.min)} °C · ${localInterval(event)} · ${event.place}`,
    });
  }

  const diamond = d3.symbol().type(d3.symbolDiamond).size(68);
  const groups = svg.selectAll("g.map-marker").data(markers).join("g")
    .attr("class", "map-marker")
    .attr("aria-label", item => item.tooltip)
    .attr("transform", item => {
      const [x, y] = projection(item.coordinates);
      return `translate(${x},${y})`;
    })
    .on("mouseenter", function (event, item) {
      const [x, y] = projection(item.coordinates);
      const rect = element.getBoundingClientRect();
      showTooltip(tooltip, container, x * rect.width / width, y * rect.height / height, item.tooltip);
    })
    .on("mouseleave", () => hideTooltip(tooltip));

  groups.filter(item => item.kind === "extreme")
    .append("path")
    .attr("class", "map-extreme")
    .attr("d", diamond);
  groups.filter(item => item.kind === "temperature")
    .append("circle")
    .attr("class", "map-temperature")
    .attr("r", 6);
  groups.append("text")
    .attr("class", "map-marker-label")
    .attr("text-anchor", "middle")
    .attr("y", item => item.kind === "temperature" ? -10 : -9)
    .text(item => item.label);

  const start = projection(stats.route[0]);
  const end = projection(stats.route.at(-1));
  svg.append("circle").attr("class", "map-start").attr("cx", start[0]).attr("cy", start[1]).attr("r", 5);
  svg.append("circle").attr("class", "map-end").attr("cx", end[0]).attr("cy", end[1]).attr("r", 6);
  svg.append("text").attr("class", "map-label").attr("x", start[0] + 9).attr("y", start[1] - 10).text("Barcelona");
  svg.append("text").attr("class", "map-label").attr("text-anchor", "end").attr("x", end[0] - 9).attr("y", end[1] - 10)
    .text(`${stats.countries.at(-1).name} · ${number1.format(stats.summary.total_km)} km`);
}

function renderCumulative() {
  const element = document.getElementById("cumulative-chart");
  const width = Math.max(320, Math.round(element.clientWidth));
  const height = width < 520 ? 300 : 310;
  const margin = width < 520 ? { top: 24, right: 14, bottom: 42, left: 44 } : { top: 24, right: 22, bottom: 42, left: 58 };
  const svg = d3.select(element).attr("viewBox", `0 0 ${width} ${height}`);
  svg.selectAll("*").remove();
  const data = stats.calendar.map(item => ({ ...item, date: new Date(`${item.date}T00:00:00Z`) }));
  const x = d3.scaleUtc().domain(d3.extent(data, item => item.date)).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, d3.max(data, item => item.cumulative)]).nice().range([height - margin.bottom, margin.top]);
  svg.append("g").attr("class", "grid").attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5).tickSize(-(width - margin.left - margin.right)).tickFormat(""));
  svg.append("path").datum(data).attr("class", "distance-area")
    .attr("d", d3.area().x(item => x(item.date)).y0(y(0)).y1(item => y(item.cumulative)).curve(d3.curveMonotoneX));
  svg.append("path").datum(data).attr("class", "distance-line")
    .attr("d", d3.line().x(item => x(item.date)).y(item => y(item.cumulative)).curve(d3.curveMonotoneX));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(width < 520 ? 4 : 7).tickFormat(d3.utcFormat("%b")));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5));
  const last = data.at(-1);
  svg.append("circle").attr("class", "map-end").attr("cx", x(last.date)).attr("cy", y(last.cumulative)).attr("r", 5);
  svg.append("text").attr("class", "chart-label").attr("text-anchor", "end")
    .attr("x", width - margin.right).attr("y", y(last.cumulative) - 10).text(`${number1.format(last.cumulative)} km`);
}

function renderMonthly() {
  const element = document.getElementById("monthly-chart");
  const width = Math.max(300, Math.round(element.clientWidth));
  const height = 310;
  const margin = { top: 30, right: 10, bottom: 46, left: 46 };
  const svg = d3.select(element).attr("viewBox", `0 0 ${width} ${height}`);
  svg.selectAll("*").remove();
  const x = d3.scaleBand().domain(stats.months.map(item => item.label)).range([margin.left, width - margin.right]).padding(.27);
  const y = d3.scaleLinear().domain([0, d3.max(stats.months, item => item.km) * 1.12]).nice().range([height - margin.bottom, margin.top]);
  svg.append("g").attr("class", "grid").attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(4).tickSize(-(width - margin.left - margin.right)).tickFormat(""));
  svg.selectAll("rect.month-bar").data(stats.months).join("rect").attr("class", "month-bar")
    .attr("x", item => x(item.label)).attr("y", item => y(item.km)).attr("width", x.bandwidth()).attr("height", item => y(0) - y(item.km));
  svg.selectAll("text.month-value").data(stats.months).join("text").attr("class", "chart-label")
    .attr("text-anchor", "middle").attr("x", item => x(item.label) + x.bandwidth() / 2).attr("y", item => y(item.km) - 7)
    .text(item => number0.format(item.km));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickSize(0).tickPadding(10));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(4));
}

function renderVisuals() {
  renderMap();
  renderCumulative();
  renderMonthly();
}

function renderAll() {
  renderTextContent();
  renderMilestones();
  renderDetails();
  renderCountries();
  renderVisuals();
}

function showError(error) {
  const main = document.querySelector("main");
  main.innerHTML = `<p class="error-message">No s’han pogut carregar les dades. Torna-ho a provar d’aquí a uns instants.</p>`;
  setText("update-status", "No s’han pogut carregar les dades");
  console.error(error);
}

try {
  const response = await fetch("data/stats.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Error de dades: ${response.status}`);
  stats = await response.json();
  renderAll();
  let resizeTimer;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(renderVisuals, 120);
  });
} catch (error) {
  showError(error);
}
