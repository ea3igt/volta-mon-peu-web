import * as d3 from "https://esm.sh/d3@7.9.0";
import world from "https://esm.sh/@d3-maps/atlas@1.0.0/world/countries/countries-50m";
import { feature } from "https://esm.sh/topojson-client@3.1.0";

const number0 = new Intl.NumberFormat("ca-ES", { maximumFractionDigits: 0 });
const number1 = new Intl.NumberFormat("ca-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const number2 = new Intl.NumberFormat("ca-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat("ca-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const shortDateFormatter = new Intl.DateTimeFormat("ca-ES", { day: "numeric", month: "short", timeZone: "UTC" });
const updateDateTimeFormatter = new Intl.DateTimeFormat("ca-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Europe/Madrid",
});
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

function formatUpdateDateTime(value) {
  if (!value) return "—";
  return `${updateDateTimeFormatter.format(new Date(value))} h`;
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
  setText("update-status", `Dades disponibles fins al ${formatDate(meta.data_as_of)}\nÚltima actualització ${formatUpdateDateTime(meta.updated_at)}`);
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
    const averageSpeed = item.average_speed_kmh == null ? "—" : `${number1.format(item.average_speed_kmh)} km/h`;
    const averageStage = item.average_stage_km == null ? "—" : `${number1.format(item.average_stage_km)} km`;
    const elevationGain = item.elevation_gain_m == null ? "—" : `≈${number0.format(item.elevation_gain_m)} m`;
    const row = document.createElement("tr");
    row.innerHTML = `
      <th class="country-name" scope="row">${item.name}</th>
      <td class="country-value">${number0.format(item.natural_days)}</td>
      <td class="country-value">${number0.format(item.stages)}</td>
      <td class="country-bar-cell"><div class="country-bar" aria-hidden="true"><span style="width:${(item.km / maximum * 100).toFixed(2)}%"></span></div></td>
      <td class="country-value">${number1.format(item.km)} km</td>
      <td class="country-value">${averageSpeed}</td>
      <td class="country-value">${averageStage}</td>
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

  const routeSegments = stats.route_segments?.length ? stats.route_segments : [stats.route];
  const detailSegments = stats.route_detail_segments?.length ? stats.route_detail_segments : routeSegments;
  const lineFeature = { type: "Feature", geometry: { type: "MultiLineString", coordinates: routeSegments } };
  const detailFeature = { type: "Feature", geometry: { type: "MultiLineString", coordinates: detailSegments } };
  const projection = d3.geoMercator().fitExtent([[28, 28], [width - 28, height - 30]], lineFeature);
  const path = d3.geoPath(projection);
  const countries = feature(world, world.objects.features).features;
  const territoryCoordinates = stats.countries
    .filter(item => Number.isFinite(item.map_lon) && Number.isFinite(item.map_lat))
    .map(item => [item.map_lon, item.map_lat]);
  const visitedCountries = new Set(countries.filter(country =>
    territoryCoordinates.some(coordinate => d3.geoContains(country, coordinate))
  ));
  const viewport = svg.append("g").attr("class", "map-viewport");
  viewport.selectAll("path.map-country").data(countries).join("path")
    .attr("class", country => visitedCountries.has(country) ? "map-country map-country-visited" : "map-country")
    .attr("d", path);
  const overviewPath = viewport.append("path").datum(lineFeature).attr("class", "map-route map-route-overview").attr("d", path);
  const detailPath = viewport.append("path").datum(detailFeature).attr("class", "map-route map-route-detail").attr("d", path);
  if (stats.route_gaps?.length) {
    const gapFeature = {
      type: "Feature",
      geometry: {
        type: "MultiLineString",
        coordinates: stats.route_gaps.map(gap => [gap.from, gap.to]),
      },
    };
    viewport.append("path").datum(gapFeature).attr("class", "map-route-gap").attr("d", path);
  }

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

  let currentTransform = d3.zoomIdentity;
  const overlayLayer = svg.append("g").attr("class", "map-overlays");
  const diamond = d3.symbol().type(d3.symbolDiamond).size(68);
  const groups = overlayLayer.selectAll("g.map-marker").data(markers).join("g")
    .attr("class", "map-marker")
    .attr("aria-label", item => item.tooltip)
    .on("mouseenter", function (event, item) {
      const [x, y] = currentTransform.apply(projection(item.coordinates));
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

  const endpoints = [
    { kind: "start", coordinates: routeSegments[0][0], label: "Barcelona" },
    {
      kind: "end",
      coordinates: routeSegments.at(-1).at(-1),
      label: `${stats.countries.at(-1).name} · ${number1.format(stats.summary.total_km)} km`,
    },
  ];
  const endpointGroups = overlayLayer.selectAll("g.map-endpoint").data(endpoints).join("g").attr("class", "map-endpoint");
  endpointGroups.append("circle")
    .attr("class", item => item.kind === "start" ? "map-start" : "map-end")
    .attr("r", item => item.kind === "start" ? 5 : 6);
  endpointGroups.append("text")
    .attr("class", "map-label")
    .attr("text-anchor", item => item.kind === "start" ? "start" : "end")
    .attr("x", item => item.kind === "start" ? 9 : -9)
    .attr("y", -10)
    .text(item => item.label);

  const placeLabels = [
    ...stats.countries
      .filter(item => Number.isFinite(item.map_lon) && Number.isFinite(item.map_lat))
      .map(item => ({
        kind: "territory",
        label: item.name,
        coordinates: [item.map_lon, item.map_lat],
        minScale: 1,
        priority: 0,
      })),
    ...(stats.map_cities || [])
      .filter(item => item.name !== "Barcelona")
      .map(item => ({
        kind: "city",
        label: item.name,
        coordinates: [item.lon, item.lat],
        minScale: item.min_scale,
        priority: 1,
        population: item.population,
      })),
  ].sort((left, right) => left.priority - right.priority
    || left.minScale - right.minScale
    || (right.population || 0) - (left.population || 0));
  const placeLabelGroups = overlayLayer.selectAll("g.map-place-label").data(placeLabels).join("g")
    .attr("class", item => `map-place-label map-${item.kind}-label`)
    .attr("aria-hidden", "true");
  placeLabelGroups.append("text").attr("text-anchor", "middle").text(item => item.label);

  const zoomLevel = document.getElementById("map-zoom-level");
  function positionPlaceLabels() {
    const occupied = [];
    for (const item of markers) {
      const [x, y] = currentTransform.apply(projection(item.coordinates));
      const markerWidth = Math.max(18, item.label.length * 7 + 8);
      occupied.push({ left: x - markerWidth / 2, right: x + markerWidth / 2, top: y - 25, bottom: y + 8 });
    }
    for (const item of endpoints) {
      const [x, y] = currentTransform.apply(projection(item.coordinates));
      const endpointWidth = item.label.length * 6.7 + 14;
      occupied.push(item.kind === "start"
        ? { left: x - 7, right: x + endpointWidth, top: y - 24, bottom: y + 8 }
        : { left: x - endpointWidth, right: x + 7, top: y - 24, bottom: y + 8 });
    }
    placeLabelGroups.each(function (item) {
      const group = d3.select(this);
      if (currentTransform.k < item.minScale) {
        group.style("display", "none");
        return;
      }
      const [x, projectedY] = currentTransform.apply(projection(item.coordinates));
      const y = projectedY + (item.kind === "territory" ? -12 : 12);
      const fontSize = item.kind === "territory" ? 11 : 10;
      const labelWidth = item.label.length * fontSize * .58 + 8;
      const labelHeight = fontSize + 6;
      const box = {
        left: x - labelWidth / 2,
        right: x + labelWidth / 2,
        top: y - labelHeight / 2,
        bottom: y + labelHeight / 2,
      };
      const inside = box.left >= 4 && box.right <= width - 4 && box.top >= 4 && box.bottom <= height - 4;
      const overlaps = occupied.some(other => !(
        box.right + 5 < other.left || box.left - 5 > other.right
        || box.bottom + 4 < other.top || box.top - 4 > other.bottom
      ));
      if (!inside || overlaps) {
        group.style("display", "none");
        return;
      }
      group.style("display", null).attr("transform", `translate(${x},${y})`);
      occupied.push(box);
    });
  }

  function positionOverlays() {
    groups.attr("transform", item => {
      const [x, y] = currentTransform.apply(projection(item.coordinates));
      return `translate(${x},${y})`;
    });
    endpointGroups.attr("transform", item => {
      const [x, y] = currentTransform.apply(projection(item.coordinates));
      return `translate(${x},${y})`;
    });
    positionPlaceLabels();
  }

  function zoomed(event) {
    currentTransform = event.transform;
    viewport.attr("transform", currentTransform);
    const detailed = currentTransform.k >= 2;
    overviewPath.classed("is-hidden", detailed);
    detailPath.classed("is-visible", detailed);
    positionOverlays();
    hideTooltip(tooltip);
    zoomLevel.value = `${currentTransform.k.toLocaleString("ca-ES", { maximumFractionDigits: 1 })}×`;
  }

  const zoom = d3.zoom()
    .scaleExtent([1, 32])
    .extent([[0, 0], [width, height]])
    .translateExtent([[0, 0], [width, height]])
    .on("zoom", zoomed);
  svg.call(zoom);
  positionOverlays();

  const animateZoom = (action, ...args) => svg.transition().duration(220).call(action, ...args);
  document.getElementById("map-zoom-in").onclick = () => animateZoom(zoom.scaleBy.bind(zoom), 1.6);
  document.getElementById("map-zoom-out").onclick = () => animateZoom(zoom.scaleBy.bind(zoom), 1 / 1.6);
  document.getElementById("map-reset").onclick = () => animateZoom(zoom.transform.bind(zoom), d3.zoomIdentity);
  element.onkeydown = event => {
    const actions = {
      "+": () => animateZoom(zoom.scaleBy.bind(zoom), 1.6),
      "=": () => animateZoom(zoom.scaleBy.bind(zoom), 1.6),
      "-": () => animateZoom(zoom.scaleBy.bind(zoom), 1 / 1.6),
      Home: () => animateZoom(zoom.transform.bind(zoom), d3.zoomIdentity),
      ArrowLeft: () => animateZoom(zoom.translateBy.bind(zoom), 40 / currentTransform.k, 0),
      ArrowRight: () => animateZoom(zoom.translateBy.bind(zoom), -40 / currentTransform.k, 0),
      ArrowUp: () => animateZoom(zoom.translateBy.bind(zoom), 0, 40 / currentTransform.k),
      ArrowDown: () => animateZoom(zoom.translateBy.bind(zoom), 0, -40 / currentTransform.k),
    };
    if (!actions[event.key]) return;
    event.preventDefault();
    actions[event.key]();
  };
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
