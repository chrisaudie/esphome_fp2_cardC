class ESPHomeFP2Card extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._hass = null;
    this._mapConfig = {};
    this._lastRender = 0;
    this._renderTimer = null;
    this._mapRequested = false;
    this._autoTrackingChanged = false;
    this._resizeObserver = null;
  }

  setConfig(config) {
    if (!config || !config.entity_prefix) {
      throw new Error("entity_prefix is required, for example sensor.fp2_bedroom");
    }

    this._config = {
      title: "Aqara FP2",
      display_mode: "full",
      show_grid: true,
      show_sensor_position: true,
      show_zone_labels: true,
      auto_tracking: false,
      mounting_position: undefined,
      entities: {},
      ...config,
    };

    if (!["full", "zoomed"].includes(this._config.display_mode)) {
      throw new Error("display_mode must be full or zoomed");
    }

    if (this._built) {
      this._title.textContent = this._config.title;
      this._requestRender();
    }
  }

  set hass(hass) {
    this._hass = hass;

    if (!this._built) {
      this._buildCard();
    }

    if (!this._mapRequested) {
      this._fetchMapConfig();
    }

    if (this._config.auto_tracking && !this._autoTrackingChanged) {
      this._setTracking(true, true);
    }

    this._requestRender();
  }

  disconnectedCallback() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }

    if (this._renderTimer) {
      clearTimeout(this._renderTimer);
    }

    if (this._config.auto_tracking && this._autoTrackingChanged) {
      this._setTracking(false, false);
    }
  }

  getCardSize() {
    return 7;
  }

  getGridOptions() {
    return {
      columns: 6,
      rows: "auto",
      min_rows: 5,
      max_rows: 12,
    };
  }

  _buildCard() {
    this.innerHTML = `
      <ha-card class="fp2-card">
        <div class="fp2-header">
          <div class="fp2-title"></div>
          <div class="fp2-actions">
            <button class="fp2-icon-button fp2-refresh" title="Refresh map">
              <ha-icon icon="mdi:refresh"></ha-icon>
            </button>
            <button class="fp2-icon-button fp2-tracking" title="Toggle target reporting">
              <ha-icon icon="mdi:crosshairs-gps"></ha-icon>
            </button>
          </div>
        </div>
        <div class="fp2-canvas-wrap">
          <canvas class="fp2-canvas"></canvas>
          <div class="fp2-info"></div>
        </div>
        <div class="fp2-message" hidden></div>
      </ha-card>
      <style>
        .fp2-card {
          padding: 16px;
          overflow: hidden;
        }

        .fp2-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }

        .fp2-title {
          min-width: 0;
          overflow: hidden;
          color: var(--primary-text-color);
          font-size: 18px;
          font-weight: 500;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .fp2-actions {
          display: flex;
          flex: 0 0 auto;
          gap: 8px;
        }

        .fp2-icon-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          padding: 0;
          color: var(--primary-text-color);
          background: var(--secondary-background-color);
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          cursor: pointer;
          transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
        }

        .fp2-icon-button:hover {
          background: var(--primary-color);
          border-color: var(--primary-color);
          color: var(--text-primary-color);
        }

        .fp2-icon-button.active {
          background: var(--primary-color);
          border-color: var(--primary-color);
          color: var(--text-primary-color);
        }

        .fp2-icon-button[disabled] {
          cursor: not-allowed;
          opacity: 0.45;
        }

        .fp2-canvas-wrap {
          position: relative;
          width: 100%;
          overflow: hidden;
          border-radius: 8px;
          background: var(--card-background-color, var(--ha-card-background, #1f1f1f));
        }

        .fp2-canvas {
          display: block;
          width: 100%;
          height: auto;
        }

        .fp2-info {
          position: absolute;
          right: 8px;
          bottom: 8px;
          left: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          padding: 6px 10px;
          overflow: hidden;
          color: var(--secondary-text-color);
          background: rgba(0, 0, 0, 0.62);
          border-radius: 6px;
          -webkit-backdrop-filter: blur(4px);
          backdrop-filter: blur(4px);
          box-sizing: border-box;
          font-size: 13px;
          line-height: 1.35;
        }

        .fp2-chip {
          display: inline-flex;
          align-items: center;
          max-width: 100%;
          gap: 6px;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .fp2-chip span:last-child {
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .fp2-dot {
          flex: 0 0 auto;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--disabled-text-color);
        }

        .fp2-dot.on { background: #4caf50; }
        .fp2-dot.target { background: #ff9800; }
        .fp2-dot.zone { background: #42a5f5; }
        .fp2-dot.mode { background: var(--primary-color); }

        .fp2-message {
          margin-top: 10px;
          color: var(--error-color);
          font-size: 13px;
        }
      </style>
    `;

    this._built = true;
    this._title = this.querySelector(".fp2-title");
    this._canvasWrap = this.querySelector(".fp2-canvas-wrap");
    this._canvas = this.querySelector(".fp2-canvas");
    this._ctx = this._canvas.getContext("2d");
    this._status = this.querySelector(".fp2-info");
    this._message = this.querySelector(".fp2-message");
    this._trackingButton = this.querySelector(".fp2-tracking");

    this._title.textContent = this._config.title;

    this.querySelector(".fp2-refresh").addEventListener("click", () => this._fetchMapConfig(true));
    this._trackingButton.addEventListener("click", () => this._toggleTracking());

    this._resizeObserver = new ResizeObserver(() => this._requestRender(true));
    this._resizeObserver.observe(this._canvasWrap);
  }

  _requestRender(immediate = false) {
    if (!this._hass || !this._canvas) {
      return;
    }

    const now = Date.now();
    const delay = immediate ? 0 : Math.max(0, 250 - (now - this._lastRender));

    if (this._renderTimer) {
      return;
    }

    this._renderTimer = setTimeout(() => {
      this._renderTimer = null;
      this._lastRender = Date.now();
      this._render();
    }, delay);
  }

  async _fetchMapConfig(force = false) {
    if (!this._hass || (this._mapRequested && !force)) {
      return;
    }

    this._mapRequested = true;
    const service = this._config.map_config_service || `${this._deviceName()}_get_map_config`;

    try {
      const result = await this._hass.callService("esphome", service, {}, undefined, undefined, true);
      this._mapConfig = result && result.response ? result.response : result || {};
      this._setMessage("");
      this._requestRender(true);
    } catch (error) {
      this._setMessage(`Could not load map config from esphome.${service}`);
    }
  }

  _render() {
    const data = this._readData();
    this._updateTrackingButton(data);
    this._drawMap(data);
    this._updateStatus(data);
  }

  _readData() {
    const states = this._hass.states;
    const getState = (entityId) => entityId && states[entityId] ? states[entityId].state : undefined;
    const getName = (entityId) => {
      if (!entityId || !states[entityId]) return entityId;
      return states[entityId].attributes.friendly_name || entityId;
    };

    const zones = this._normalizeZones(this._mapConfig.zones || [], getState, getName);

    return {
      edgeGrid: this._parseGrid(this._mapConfig.edge_grid),
      exitGrid: this._parseGrid(this._mapConfig.exit_grid),
      interferenceGrid: this._parseGrid(this._mapConfig.interference_grid),
      mountingPosition: this._config.mounting_position || this._mapConfig.mounting_position || "wall",
      zones,
      targets: this._decodeTargets(getState(this._entity("targets"))),
      totalPeople: this._numberState(this._entity("total_people")),
      globalPresence: getState(this._entity("global_presence")) === "on",
      radarState: getState(this._entity("radar_state")),
      operatingMode: getState(this._entity("operating_mode")),
      trackingState: getState(this._entity("report_targets")),
    };
  }

  _normalizeZones(zones, getState, getName) {
    if (!Array.isArray(zones)) {
      return [];
    }

    return zones.map((zone, index) => {
      const presenceEntity = this._fullEntityId(zone.presence_sensor, "binary_sensor");
      const label = zone.name || (presenceEntity ? getName(presenceEntity) : `Zone ${index + 1}`);

      return {
        name: this._cleanName(label),
        presenceEntity,
        occupied: getState(presenceEntity) === "on",
        grid: this._parseGrid(zone.grid),
      };
    });
  }

  _drawMap(data) {
    const width = Math.floor(this._canvasWrap.clientWidth);
    if (!width) {
      return;
    }

    const bounds = this._bounds(data);
    const gridWidth = bounds.maxX - bounds.minX + 1;
    const gridHeight = bounds.maxY - bounds.minY + 1;
    const maxHeight = Math.max(280, window.innerHeight * 0.62);
    const height = Math.min(width * (gridHeight / gridWidth), maxHeight);
    const cellSize = height / gridHeight;
    const dpr = window.devicePixelRatio || 1;

    this._canvas.width = Math.round(width * dpr);
    this._canvas.height = Math.round(height * dpr);
    this._canvas.style.height = `${height}px`;

    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._ctx.clearRect(0, 0, width, height);

    this._fillBackground(width, height);
    this._drawGrid(bounds, cellSize);
    this._drawEdgeGrid(data.edgeGrid, bounds, cellSize);
    this._drawMask(data.interferenceGrid, bounds, cellSize, "rgba(244, 67, 54, 0.22)", "rgba(244, 67, 54, 0.55)");
    this._drawMask(data.exitGrid, bounds, cellSize, "rgba(76, 175, 80, 0.16)", "rgba(76, 175, 80, 0.55)");
    this._drawZones(data.zones, bounds, cellSize);
    this._drawTargets(data.targets, bounds, cellSize);

    if (this._config.show_sensor_position !== false) {
      this._drawSensor(data.mountingPosition, bounds, cellSize);
    }
  }

  _fillBackground(width, height) {
    this._ctx.fillStyle = this._cssVar("--card-background-color", this._cssVar("--ha-card-background", "#1f1f1f"));
    this._ctx.fillRect(0, 0, width, height);
  }

  _drawGrid(bounds, cellSize) {
    if (this._config.show_grid === false) {
      return;
    }

    const width = (bounds.maxX - bounds.minX + 1) * cellSize;
    const height = (bounds.maxY - bounds.minY + 1) * cellSize;

    this._ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    this._ctx.lineWidth = 1;

    for (let x = 0; x <= bounds.maxX - bounds.minX + 1; x += 1) {
      const px = x * cellSize;
      this._ctx.beginPath();
      this._ctx.moveTo(px, 0);
      this._ctx.lineTo(px, height);
      this._ctx.stroke();
    }

    for (let y = 0; y <= bounds.maxY - bounds.minY + 1; y += 1) {
      const py = y * cellSize;
      this._ctx.beginPath();
      this._ctx.moveTo(0, py);
      this._ctx.lineTo(width, py);
      this._ctx.stroke();
    }
  }

  _drawMask(grid, bounds, cellSize, fill, stroke) {
    this._ctx.fillStyle = fill;
    this._ctx.strokeStyle = stroke;
    this._ctx.lineWidth = 1;

    this._forVisibleCell(bounds, (x, y, px, py) => {
      if (!grid[y][x]) {
        return;
      }

      this._ctx.fillRect(px, py, cellSize, cellSize);
      this._ctx.strokeRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
    }, cellSize);
  }

  _drawEdgeGrid(grid, bounds, cellSize) {
    this._ctx.fillStyle = "rgba(0, 0, 0, 0.30)";
    this._ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    this._ctx.lineWidth = 1;

    this._forVisibleCell(bounds, (x, y, px, py) => {
      if (!grid[y][x]) {
        return;
      }

      this._ctx.fillRect(px, py, cellSize, cellSize);
      this._ctx.beginPath();
      this._ctx.moveTo(px, py);
      this._ctx.lineTo(px + cellSize, py + cellSize);
      this._ctx.stroke();
    }, cellSize);
  }

  _drawZones(zones, bounds, cellSize) {
    zones.forEach((zone) => {
      const zoneBounds = this._gridBounds(zone.grid);
      const fill = zone.occupied ? "rgba(66, 165, 245, 0.36)" : "rgba(66, 165, 245, 0.10)";
      const stroke = zone.occupied ? "rgba(33, 150, 243, 0.95)" : "rgba(33, 150, 243, 0.35)";

      this._ctx.fillStyle = fill;
      this._forVisibleCell(bounds, (x, y, px, py) => {
        if (zone.grid[y][x]) {
          this._ctx.fillRect(px, py, cellSize, cellSize);
        }
      }, cellSize);

      if (!zoneBounds) {
        return;
      }

      const x = (zoneBounds.minX - bounds.minX) * cellSize;
      const y = (zoneBounds.minY - bounds.minY) * cellSize;
      const w = (zoneBounds.maxX - zoneBounds.minX + 1) * cellSize;
      const h = (zoneBounds.maxY - zoneBounds.minY + 1) * cellSize;

      if (x + w < 0 || y + h < 0) {
        return;
      }

      this._ctx.strokeStyle = stroke;
      this._ctx.lineWidth = zone.occupied ? 2.5 : 1.5;
      this._ctx.setLineDash(zone.occupied ? [] : [5, 5]);
      this._ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      this._ctx.setLineDash([]);

      if (this._config.show_zone_labels !== false) {
        this._drawZoneLabel(zone.name, x + w / 2, y + h / 2, cellSize, zone.occupied);
      }
    });
  }

  _drawZoneLabel(label, x, y, cellSize, occupied) {
    const text = String(label || "Zone");
    const fontSize = Math.max(10, Math.min(14, cellSize * 0.42));

    this._ctx.font = `600 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
    const width = this._ctx.measureText(text).width + 14;
    const height = fontSize + 8;

    this._roundedRect(x - width / 2, y - height / 2, width, height, height / 2);
    this._ctx.fillStyle = occupied ? "rgba(33, 150, 243, 0.92)" : "rgba(33, 150, 243, 0.58)";
    this._ctx.fill();

    this._ctx.fillStyle = "#fff";
    this._ctx.textAlign = "center";
    this._ctx.textBaseline = "middle";
    this._ctx.fillText(text, x, y);
  }

  _drawTargets(targets, bounds, cellSize) {
    targets.forEach((target) => {
      const point = this._targetToGrid(target);

      if (point.x < bounds.minX || point.x > bounds.maxX + 1 || point.y < bounds.minY || point.y > bounds.maxY + 1) {
        return;
      }

      const x = (point.x - bounds.minX) * cellSize;
      const y = (point.y - bounds.minY) * cellSize;
      const radius = Math.max(8, Math.min(18, cellSize * 0.34));

      const glow = this._ctx.createRadialGradient(x, y, 0, x, y, radius * 2.6);
      glow.addColorStop(0, "rgba(255, 152, 0, 0.34)");
      glow.addColorStop(1, "rgba(255, 152, 0, 0)");
      this._ctx.fillStyle = glow;
      this._ctx.beginPath();
      this._ctx.arc(x, y, radius * 2.6, 0, Math.PI * 2);
      this._ctx.fill();

      this._ctx.fillStyle = target.active ? "rgba(255, 152, 0, 0.92)" : "rgba(255, 152, 0, 0.48)";
      this._ctx.strokeStyle = "rgba(255, 111, 0, 1)";
      this._ctx.lineWidth = 2;
      this._ctx.beginPath();
      this._ctx.arc(x, y, radius, 0, Math.PI * 2);
      this._ctx.fill();
      this._ctx.stroke();

      this._ctx.fillStyle = "#111";
      this._ctx.font = `700 ${Math.min(14, radius)}px system-ui, sans-serif`;
      this._ctx.textAlign = "center";
      this._ctx.textBaseline = "middle";
      this._ctx.fillText(this._postureInitial(target.posture, target.id), x, y);

      if (Math.abs(target.velocity) > 5) {
        const speed = Math.min(Math.abs(target.velocity) / 100, 1);
        const line = radius * 1.5 * speed;

        this._ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
        this._ctx.lineWidth = 2;
        this._ctx.beginPath();
        this._ctx.moveTo(x, y + radius + 2);
        this._ctx.lineTo(x, y + radius + 2 + (target.velocity > 0 ? -line : line));
        this._ctx.stroke();
      }
    });
  }

  _drawSensor(position, bounds, cellSize) {
    const points = {
      wall: { x: 7, y: 0 },
      left_corner: { x: 0, y: 0 },
      left_upper_corner: { x: 0, y: 0 },
      right_corner: { x: 14, y: 0 },
      right_upper_corner: { x: 14, y: 0 },
    };
    const sensor = points[position] || points.wall;

    if (sensor.x < bounds.minX - 1 || sensor.x > bounds.maxX + 1 || sensor.y < bounds.minY - 1 || sensor.y > bounds.maxY + 1) {
      return;
    }

    const x = (sensor.x - bounds.minX) * cellSize;
    const y = (sensor.y - bounds.minY) * cellSize;

    this._ctx.strokeStyle = "rgba(244, 67, 54, 0.72)";
    this._ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i += 1) {
      this._ctx.beginPath();
      this._ctx.arc(x, y, 9 + i * 8, 0, Math.PI);
      this._ctx.stroke();
    }

    this._ctx.fillStyle = "#f44336";
    this._ctx.beginPath();
    this._ctx.arc(x, y, 4, 0, Math.PI * 2);
    this._ctx.fill();

    const canvasWidth = (bounds.maxX - bounds.minX + 1) * cellSize;
    const labelX = Math.min(Math.max(x, 24), canvasWidth - 24);

    this._ctx.fillStyle = "rgba(244, 67, 54, 0.92)";
    this._ctx.font = "700 10px system-ui, sans-serif";
    this._ctx.textAlign = "center";
    this._ctx.textBaseline = "top";
    this._ctx.fillText("SENSOR", labelX, y + 30);
  }

  _updateStatus(data) {
    const chips = [];
    chips.push(this._chip(data.globalPresence ? "on" : "", data.globalPresence ? "Occupied" : "Clear"));

    if (Number.isFinite(data.totalPeople) && data.totalPeople > 0) {
      chips.push(this._chip("target", `${data.totalPeople} ${data.totalPeople === 1 ? "person" : "people"}`));
    }

    if (data.targets.length) {
      chips.push(this._chip("target", `${data.targets.length} live ${data.targets.length === 1 ? "target" : "targets"}`));
    }

    data.zones.forEach((zone) => {
      chips.push(this._chip(zone.occupied ? "zone on" : "zone", zone.name));
    });

    if (data.radarState) {
      chips.push(this._chip("mode", `Radar: ${data.radarState}`));
    }

    if (data.operatingMode) {
      chips.push(this._chip("mode", data.operatingMode));
    }

    this._status.replaceChildren(...chips);
  }

  _chip(kind, label) {
    const chip = document.createElement("span");
    chip.className = "fp2-chip";

    const dot = document.createElement("span");
    dot.className = `fp2-dot ${kind}`;

    const text = document.createElement("span");
    text.textContent = label;

    chip.append(dot, text);
    return chip;
  }

  _updateTrackingButton(data) {
    const entity = this._entity("report_targets");
    const exists = entity && this._hass.states[entity];

    this._trackingButton.disabled = !exists;
    this._trackingButton.classList.toggle("active", data.trackingState === "on");
  }

  _toggleTracking() {
    const entity = this._entity("report_targets");
    const state = entity && this._hass.states[entity];

    if (!state) {
      return;
    }

    this._setTracking(state.state !== "on", false);
  }

  _setTracking(enabled, automatic) {
    const entity = this._entity("report_targets");
    const state = entity && this._hass && this._hass.states[entity];

    if (!state) {
      return;
    }

    if ((enabled && state.state === "on") || (!enabled && state.state === "off")) {
      return;
    }

    this._hass.callService("switch", enabled ? "turn_on" : "turn_off", { entity_id: entity });

    if (automatic) {
      this._autoTrackingChanged = true;
    }
  }

  _entity(key) {
    const override = this._config.entities && this._config.entities[key];
    if (override) {
      return override;
    }

    const prefix = this._config.entity_prefix;
    const base = this._deviceName();

    const defaults = {
      targets: `${prefix}_targets`,
      total_people: `${prefix}_total_people`,
      global_presence: `binary_sensor.${base}_global_presence`,
      report_targets: `switch.${base}_report_targets`,
      radar_state: `sensor.${base}_radar_state`,
      operating_mode: `select.${base}_operating_mode`,
    };

    return defaults[key];
  }

  _deviceName() {
    return String(this._config.entity_prefix).replace(/^[^.]+\./, "");
  }

  _fullEntityId(value, fallbackDomain) {
    if (!value) {
      return undefined;
    }

    const text = String(value);
    return text.includes(".") ? text : `${fallbackDomain}.${text}`;
  }

  _numberState(entityId) {
    const state = entityId && this._hass.states[entityId] ? Number(this._hass.states[entityId].state) : 0;
    return Number.isFinite(state) ? state : 0;
  }

  _parseGrid(value) {
    const empty = () => Array.from({ length: 14 }, () => Array(14).fill(0));

    if (Array.isArray(value)) {
      const grid = empty();
      value.slice(0, 14).forEach((row, y) => {
        if (Array.isArray(row)) {
          row.slice(0, 14).forEach((cell, x) => {
            grid[y][x] = cell ? 1 : 0;
          });
        }
      });
      return grid;
    }

    if (typeof value !== "string" || !value.trim()) {
      return empty();
    }

    const trimmed = value.trim();

    if (/^[0-9a-fA-F]{56}$/.test(trimmed)) {
      const grid = empty();
      for (let y = 0; y < 14; y += 1) {
        const rowBits = parseInt(trimmed.slice(y * 4, y * 4 + 4), 16);
        for (let x = 0; x < 14; x += 1) {
          grid[y][x] = (rowBits >> (13 - x)) & 1;
        }
      }
      return grid;
    }

    const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length) {
      const grid = empty();
      lines.slice(0, 14).forEach((line, y) => {
        Array.from(line).slice(0, 14).forEach((char, x) => {
          grid[y][x] = /[xX1#]/.test(char) ? 1 : 0;
        });
      });
      return grid;
    }

    return empty();
  }

  _decodeTargets(value) {
    if (!value || value === "unknown" || value === "unavailable") {
      return [];
    }

    try {
      const binary = atob(value);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const count = bytes[0] || 0;
      const targets = [];
      const i16 = (offset) => {
        const raw = (bytes[offset] << 8) | bytes[offset + 1];
        return raw > 32767 ? raw - 65536 : raw;
      };

      for (let index = 0; index < count; index += 1) {
        const offset = 1 + index * 14;
        if (offset + 13 >= bytes.length) {
          break;
        }

        targets.push({
          id: bytes[offset],
          x: i16(offset + 1),
          y: i16(offset + 3),
          z: i16(offset + 5),
          velocity: i16(offset + 7),
          snr: i16(offset + 9),
          classifier: bytes[offset + 11],
          posture: bytes[offset + 12],
          active: bytes[offset + 13] !== 0,
        });
      }

      return targets;
    } catch (error) {
      return [];
    }
  }

  _targetToGrid(target) {
    return {
      x: ((-target.x + 400) / 800) * 14,
      y: (target.y / 800) * 14,
    };
  }

  _postureInitial(posture, fallback) {
    return {
      0: "S",
      1: "s",
      2: "L",
    }[posture] || String(fallback);
  }

  _bounds(data) {
    if (this._config.display_mode !== "zoomed") {
      return { minX: 0, maxX: 13, minY: 0, maxY: 13 };
    }

    const insideBounds = this._inverseGridBounds(data.edgeGrid);
    if (insideBounds) {
      return this._padBounds(insideBounds, 1);
    }

    const grids = data.zones.map((zone) => zone.grid);
    let minX = 13;
    let minY = 13;
    let maxX = 0;
    let maxY = 0;
    let found = false;

    grids.forEach((grid) => {
      const bounds = this._gridBounds(grid);
      if (!bounds) {
        return;
      }

      found = true;
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    });

    if (!found) {
      return { minX: 0, maxX: 13, minY: 0, maxY: 13 };
    }

    return this._padBounds({ minX, maxX, minY, maxY }, 1);
  }

  _gridBounds(grid) {
    let minX = 14;
    let minY = 14;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < 14; y += 1) {
      for (let x = 0; x < 14; x += 1) {
        if (grid[y][x]) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    return maxX >= 0 ? { minX, maxX, minY, maxY } : null;
  }

  _inverseGridBounds(grid) {
    let hasMaskedCell = false;
    let minX = 14;
    let minY = 14;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < 14; y += 1) {
      for (let x = 0; x < 14; x += 1) {
        if (grid[y][x]) {
          hasMaskedCell = true;
          continue;
        }

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    return hasMaskedCell && maxX >= 0 ? { minX, maxX, minY, maxY } : null;
  }

  _padBounds(bounds, padding) {
    return {
      minX: Math.max(0, bounds.minX - padding),
      maxX: Math.min(13, bounds.maxX + padding),
      minY: Math.max(0, bounds.minY - padding),
      maxY: Math.min(13, bounds.maxY + padding),
    };
  }

  _forVisibleCell(bounds, callback, cellSize) {
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        callback(x, y, (x - bounds.minX) * cellSize, (y - bounds.minY) * cellSize);
      }
    }
  }

  _roundedRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    this._ctx.beginPath();
    this._ctx.moveTo(x + r, y);
    this._ctx.lineTo(x + width - r, y);
    this._ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    this._ctx.lineTo(x + width, y + height - r);
    this._ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    this._ctx.lineTo(x + r, y + height);
    this._ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    this._ctx.lineTo(x, y + r);
    this._ctx.quadraticCurveTo(x, y, x + r, y);
    this._ctx.closePath();
  }

  _cssVar(name, fallback) {
    const value = getComputedStyle(this).getPropertyValue(name).trim();
    return value || fallback;
  }

  _cleanName(value) {
    return String(value || "Zone")
      .replace(/^binary_sensor\./, "")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  _setMessage(message) {
    this._message.textContent = message;
    this._message.hidden = !message;
  }
}

if (!customElements.get("esphome-fp2-card")) {
  customElements.define("esphome-fp2-card", ESPHomeFP2Card);
}

if (!customElements.get("aqara-fp2-card")) {
  customElements.define("aqara-fp2-card", class AqaraFP2Card extends ESPHomeFP2Card {});
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "aqara-fp2-card",
  name: "Aqara FP2 Card",
  description: "Visualizes ESPHome Aqara FP2 radar zones, presence, and target tracking",
  preview: true,
});
window.customCards.push({
  type: "esphome-fp2-card",
  name: "ESPHome FP2 Card",
  description: "Visualizes ESPHome Aqara FP2 radar zones, presence, and target tracking",
  preview: true,
});
