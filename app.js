const WELL_CONFIG = [
  {
    id: 'IW-ESP-01',
    name: 'IntelliWell ESP-01',
    liftType: 'ESP',
    fluidType: 'oil',
    depthFt: 8900,
    formationPressurePsi: 3920,
    basePressure: 2350,
    baseTemp: 86,
    baseRate: 640
  },
  {
    id: 'IW-GL-01',
    name: 'IntelliWell GL-01',
    liftType: 'gas lift',
    fluidType: 'gas',
    depthFt: 10150,
    formationPressurePsi: 4350,
    basePressure: 2650,
    baseTemp: 92,
    baseRate: 4300
  },
  {
    id: 'IW-PCP-01',
    name: 'IntelliWell PCP-01',
    liftType: 'PCP',
    fluidType: 'oil',
    depthFt: 7200,
    formationPressurePsi: 3380,
    basePressure: 2100,
    baseTemp: 80,
    baseRate: 520
  },
  {
    id: 'IW-SRP-01',
    name: 'IntelliWell SRP-01',
    liftType: 'SRP',
    fluidType: 'oil',
    depthFt: 6500,
    formationPressurePsi: 3120,
    basePressure: 1980,
    baseTemp: 76,
    baseRate: 470
  }
];

const RATE_UNIT = { oil: 'bbl/d', gas: 'Mscf/d' };

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function isoHour(baseDate, hourOffset) {
  return new Date(baseDate.getTime() + hourOffset * 3600 * 1000).toISOString();
}

function buildDataset() {
  const start = new Date('2026-01-01T00:00:00Z');

  return WELL_CONFIG.map((well, wellIndex) => {
    const history = [];
    for (let i = 0; i < 120; i += 1) {
      const pressurePsi = round(well.basePressure + 60 * Math.sin((i + wellIndex * 2) / 8) - i * 0.8);
      const temperatureC = round(well.baseTemp + 4 * Math.sin((i + wellIndex) / 10) + 0.02 * i);
      const flowRate = round(well.baseRate - i * (well.fluidType === 'gas' ? 11 : 1.4) + 16 * Math.cos(i / 9));

      let liftIndicators = {};
      if (well.liftType === 'ESP') {
        liftIndicators = {
          motorCurrentA: round(62 + 7 * Math.sin(i / 7)),
          pumpFrequencyHz: round(54 - 0.03 * i),
          intakePressurePsi: round(pressurePsi - 180),
          dischargePressurePsi: round(pressurePsi + 240),
          motorTemperatureC: round(92 + 0.08 * i),
          vibrationMmS: round(3.1 + 0.02 * i)
        };
      } else if (well.liftType === 'gas lift') {
        liftIndicators = {
          injectionGasRateMscfd: round(780 + 70 * Math.sin(i / 6)),
          injectionPressurePsi: round(1240 + 40 * Math.sin(i / 8)),
          casingPressurePsi: round(1040 + 30 * Math.cos(i / 11)),
          tubingPressurePsi: round(pressurePsi - 120),
          valveStatus: i % 18 === 0 ? 'cycling' : 'open'
        };
      } else if (well.liftType === 'PCP') {
        liftIndicators = {
          torqueNm: round(1850 + 90 * Math.sin(i / 5)),
          pumpSpeedRpm: round(260 - 0.25 * i),
          intakePressurePsi: round(pressurePsi - 150),
          dischargePressurePsi: round(pressurePsi + 160),
          vibrationMmS: round(2.5 + 0.015 * i)
        };
      } else {
        liftIndicators = {
          strokeRateSpm: round(8.8 - 0.01 * i, 2),
          polishedRodLoadLbf: round(14500 + 500 * Math.sin(i / 5)),
          casingPressurePsi: round(900 + 20 * Math.cos(i / 12)),
          tubingPressurePsi: round(pressurePsi - 95),
          gearboxTemperatureC: round(68 + 0.05 * i)
        };
      }

      const stressScore =
        (well.liftType === 'ESP' ? liftIndicators.vibrationMmS : 0) +
        (well.liftType === 'gas lift' && liftIndicators.valveStatus === 'cycling' ? 1 : 0) +
        (flowRate < well.baseRate * 0.78 ? 1.4 : 0);

      history.push({
        timestamp: isoHour(start, i),
        pressurePsi,
        temperatureC,
        flowRate,
        equipmentStatus: stressScore > 3.2 ? 'warning' : 'normal',
        liftIndicators
      });
    }

    const events = history
      .filter((_, idx) => idx % 12 === 0)
      .map((item, idx) => {
        const severity = idx % 5 === 0 ? 'high' : idx % 2 === 0 ? 'medium' : 'low';
        const message =
          well.liftType === 'ESP'
            ? `Rule: vibration > 4.5 mm/s or motor temp trend up. Current vibration ${item.liftIndicators.vibrationMmS ?? 'n/a'} mm/s.`
            : well.liftType === 'gas lift'
            ? `Rule: valve cycling with casing/tubing pressure spread. Valve status is ${item.liftIndicators.valveStatus}.`
            : `Rule: lift-specific pressure/load trend outside expected band.`;
        return {
          timestamp: item.timestamp,
          severity,
          liftType: well.liftType,
          message
        };
      });

    const production = [];
    const prodStart = new Date('2026-02-01T00:00:00Z');
    const startRate = history[history.length - 50].flowRate;
    for (let d = 0; d < 50; d += 1) {
      const t = d;
      const rate = round(startRate * (1 - 0.004 * t) + 6 * Math.sin((d + wellIndex) / 5));
      production.push({
        date: new Date(prodStart.getTime() + d * 86400 * 1000).toISOString().slice(0, 10),
        actualRate: Math.max(1, rate)
      });
    }

    return { ...well, history, events, production };
  });
}

function calculateAlerts(well) {
  const latest = well.history.at(-1);
  const prior = well.history.at(-7);
  const alerts = [];

  if (latest.flowRate < prior.flowRate * 0.9) {
    alerts.push({
      severity: 'high',
      text: `Rule-based alert: flow-rate dropped ${(100 - (latest.flowRate / prior.flowRate) * 100).toFixed(1)}% over 6 hours.`
    });
  }

  if (well.liftType === 'ESP') {
    if (latest.liftIndicators.vibrationMmS > 4.8 || latest.liftIndicators.motorTemperatureC > 104) {
      alerts.push({
        severity: 'high',
        text: 'Rule-based alert: ESP vibration or motor temperature exceeded configured threshold.'
      });
    }
    if (latest.liftIndicators.pumpFrequencyHz < 50) {
      alerts.push({ severity: 'medium', text: 'Rule-based alert: ESP frequency is below nominal operating band (50-60 Hz).' });
    }
  }

  if (well.liftType === 'gas lift') {
    const pressureSpread = latest.liftIndicators.injectionPressurePsi - latest.liftIndicators.tubingPressurePsi;
    if (pressureSpread < 200 || latest.liftIndicators.valveStatus === 'cycling') {
      alerts.push({
        severity: 'medium',
        text: 'Rule-based alert: gas-lift injection pressure spread/valve cycling indicates unstable lift efficiency.'
      });
    }
  }

  if (alerts.length === 0) {
    alerts.push({ severity: 'low', text: 'No elevated failure risk based on current rule set; continue monitoring trends.' });
  }

  return alerts;
}

function forecastSeries(well) {
  const actual = well.production;
  const last = actual.at(-1).actualRate;
  const slope = (actual.at(-1).actualRate - actual.at(-8).actualRate) / 7;
  const forecast = [];
  const arps = [];
  const b = 0.85;
  const di = 0.018;

  for (let i = 1; i <= 25; i += 1) {
    const nextDate = new Date(`${actual.at(-1).date}T00:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + i);
    const day = nextDate.toISOString().slice(0, 10);

    forecast.push({
      date: day,
      value: round(Math.max(1, last + slope * i))
    });

    arps.push({
      date: day,
      value: round(Math.max(1, last / ((1 + b * di * i) ** (1 / b))))
    });
  }

  return { actual, forecast, arps };
}

const dataset = buildDataset();
const wellSelector = document.getElementById('wellSelector');
const severityFilter = document.getElementById('eventSeverityFilter');
const wellMeta = document.getElementById('wellMeta');
const overviewCards = document.getElementById('overviewCards');
const liftIndicatorsEl = document.getElementById('liftIndicators');
const alertsList = document.getElementById('alertsList');
const alertsState = document.getElementById('alertsState');
const eventRows = document.getElementById('eventRows');
const eventEmpty = document.getElementById('eventEmpty');

let sensorChart;
let forecastChart;

function formatValue(key, value, fluidType) {
  const map = {
    pressurePsi: `${value} psi`,
    temperatureC: `${value} °C`,
    flowRate: `${value} ${RATE_UNIT[fluidType]}`,
    equipmentStatus: value
  };
  return map[key] ?? value;
}

function renderOverview(well) {
  const latest = well.history.at(-1);
  wellMeta.textContent = `${well.name} · Lift type: ${well.liftType.toUpperCase()} · Fluid: ${well.fluidType.toUpperCase()} · Depth: ${well.depthFt} ft (fixed) · Formation pressure: ${well.formationPressurePsi} psi`;

  const cards = [
    { key: 'pressurePsi', label: 'Pressure' },
    { key: 'temperatureC', label: 'Temperature' },
    { key: 'flowRate', label: 'Flow rate' },
    { key: 'equipmentStatus', label: 'Equipment status' }
  ];

  overviewCards.innerHTML = cards
    .map(
      (card) => `<article class="card"><div class="label">${card.label}</div><div class="value">${formatValue(card.key, latest[card.key], well.fluidType)}</div></article>`
    )
    .join('');

  liftIndicatorsEl.innerHTML = Object.entries(latest.liftIndicators)
    .map(([k, v]) => `<article class="card"><div class="label">${k.replace(/([A-Z])/g, ' $1')}</div><div class="value">${typeof v === 'number' ? v : v}</div></article>`)
    .join('');
}

function renderAlerts(well) {
  const alerts = calculateAlerts(well);
  alertsList.innerHTML = alerts
    .map((a) => `<li class="alert-${a.severity}"><strong>${a.severity.toUpperCase()}</strong> - ${a.text}</li>`)
    .join('');
  alertsState.hidden = alerts.length > 0;
}

function renderEvents(well) {
  const severity = severityFilter.value;
  const filtered = well.events.filter((event) => severity === 'all' || event.severity === severity);

  eventRows.innerHTML = filtered
    .map(
      (event) => `<tr><td>${event.timestamp.replace('T', ' ').replace('Z', '')}</td><td>${event.severity}</td><td>${event.liftType}</td><td>${event.message}</td></tr>`
    )
    .join('');

  eventEmpty.hidden = filtered.length !== 0;
}

function renderSensorChart(well) {
  const labels = well.history.map((point) => point.timestamp.slice(5, 16).replace('T', ' '));

  const config = {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Pressure (psi)', data: well.history.map((x) => x.pressurePsi), borderColor: '#2563eb', yAxisID: 'y' },
        { label: 'Temperature (°C)', data: well.history.map((x) => x.temperatureC), borderColor: '#f59e0b', yAxisID: 'y1' },
        { label: `Flow rate (${RATE_UNIT[well.fluidType]})`, data: well.history.map((x) => x.flowRate), borderColor: '#10b981', yAxisID: 'y' }
      ]
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        y: { type: 'linear', position: 'left' },
        y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false } }
      }
    }
  };

  if (sensorChart) sensorChart.destroy();
  sensorChart = new Chart(document.getElementById('sensorChart'), config);
}

function renderForecastChart(well) {
  const series = forecastSeries(well);
  const labels = [...series.actual.map((x) => x.date), ...series.forecast.map((x) => x.date)];
  const actualValues = [...series.actual.map((x) => x.actualRate), ...Array(series.forecast.length).fill(null)];
  const forecastValues = [...Array(series.actual.length).fill(null), ...series.forecast.map((x) => x.value)];
  const arpsValues = [...Array(series.actual.length).fill(null), ...series.arps.map((x) => x.value)];

  const config = {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: `Actual (${RATE_UNIT[well.fluidType]})`, data: actualValues, borderColor: '#1d4ed8' },
        { label: 'Forecast trend', data: forecastValues, borderColor: '#16a34a', borderDash: [6, 4] },
        { label: 'Arps baseline', data: arpsValues, borderColor: '#b45309', borderDash: [2, 3] }
      ]
    },
    options: { maintainAspectRatio: false }
  };

  if (forecastChart) forecastChart.destroy();
  forecastChart = new Chart(document.getElementById('forecastChart'), config);
}

function renderWell(wellId) {
  const well = dataset.find((w) => w.id === wellId);
  if (!well) return;
  renderOverview(well);
  renderAlerts(well);
  renderEvents(well);
  renderSensorChart(well);
  renderForecastChart(well);

  const form = document.getElementById('simForm');
  form.depthFt.value = well.depthFt;
  form.formationPressurePsi.value = well.formationPressurePsi;
  form.inletTempC.value = well.history.at(-1).temperatureC;
  form.initialRate.value = Math.max(1, Math.round(well.history.at(-1).flowRate));
  form.diameterIn.value = 4.5;
  form.fluidType.value = well.fluidType;
}

function initialize() {
  WELL_CONFIG.forEach((well) => {
    const option = document.createElement('option');
    option.value = well.id;
    option.textContent = `${well.id} (${well.liftType})`;
    wellSelector.appendChild(option);
  });

  wellSelector.addEventListener('change', () => renderWell(wellSelector.value));
  severityFilter.addEventListener('change', () => renderEvents(dataset.find((w) => w.id === wellSelector.value)));

  renderWell(WELL_CONFIG[0].id);
}

document.getElementById('simForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const simError = document.getElementById('simError');
  const simResult = document.getElementById('simResult');
  simError.hidden = true;
  simResult.hidden = true;

  const form = event.currentTarget;
  const depthFt = Number(form.depthFt.value);
  const inletTempC = Number(form.inletTempC.value);
  const initialRate = Number(form.initialRate.value);
  const diameterIn = Number(form.diameterIn.value);
  const formationPressurePsi = Number(form.formationPressurePsi.value);
  const geothermalGradient = Number(form.geothermalGradient.value);
  const fluidType = form.fluidType.value;
  const completionType = form.completionType.value;

  if (
    [depthFt, inletTempC, initialRate, diameterIn, formationPressurePsi, geothermalGradient].some((value) => Number.isNaN(value)) ||
    depthFt <= 0 ||
    diameterIn <= 0
  ) {
    simError.textContent = 'Please provide valid numeric values for all simulator fields.';
    simError.hidden = false;
    return;
  }

  const bottomholeTempC = round(inletTempC + geothermalGradient * (depthFt / 100), 2);
  const hydrostaticPerFt = fluidType === 'oil' ? 0.433 : 0.1;
  const frictionFactor = fluidType === 'oil' ? 0.015 : 0.009;
  const hydrostaticPsi = depthFt * hydrostaticPerFt;
  const frictionLossPsi = (initialRate / diameterIn) * frictionFactor;
  let flowingBhpPsi = round(120 + hydrostaticPsi + frictionLossPsi, 1);
  if (flowingBhpPsi >= formationPressurePsi) {
    flowingBhpPsi = round(formationPressurePsi - 5, 1);
  }

  simResult.innerHTML = `
    <p><strong>Estimated flowing bottomhole pressure:</strong> ${flowingBhpPsi} psi (capped to remain below formation pressure ${formationPressurePsi} psi)</p>
    <p><strong>Estimated bottomhole temperature:</strong> ${bottomholeTempC} °C using geothermal gradient ${geothermalGradient} °C/100 ft</p>
    <p><strong>Rate basis:</strong> ${initialRate} ${RATE_UNIT[fluidType]} · <strong>Completion:</strong> ${completionType}</p>
    <p class="small-note">Synthetic simplified simulator output only. Do not use for operational decisions.</p>
  `;
  simResult.hidden = false;
});

initialize();
