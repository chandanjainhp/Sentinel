use axum::{
    extract::State,
    http::StatusCode,
    response::Html,
    routing::{get, post},
    Json, Router,
};
use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, VecDeque},
    env,
    net::SocketAddr,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::{sync::Mutex, time::sleep};

const HTML: &str = include_str!("../web/index.html");
const MAX_LOGS: usize = 160;
const MAX_FRAMES: usize = 90;

#[derive(Clone)]
struct AppState {
    inner: Arc<Mutex<LabState>>,
    client: reqwest::Client,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum Scenario {
    Normal,
    VibrationRamp,
    Overheating,
    Overload,
    SensorDropout,
    Startup,
    CombinedFault,
}

impl Default for Scenario {
    fn default() -> Self { Self::Normal }
}

impl Scenario {
    fn label(&self) -> &'static str {
        match self {
            Self::Normal => "Normal operation",
            Self::VibrationRamp => "Vibration ramp / bearing fault",
            Self::Overheating => "Overheating",
            Self::Overload => "Motor overload",
            Self::SensorDropout => "Sensor dropout",
            Self::Startup => "Motor startup",
            Self::CombinedFault => "Combined fault",
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum PayloadMode {
    PerChannel,
    MultiChannel,
}

impl Default for PayloadMode {
    fn default() -> Self { Self::PerChannel }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct LabConfig {
    api_base_url: String,
    api_key: String,
    site_id: String,
    machine_id: String,
    sensor_ids: BTreeMap<String, String>,
    interval_ms: u64,
    forward_to_sentinel: bool,
    include_pressure: bool,
    payload_mode: PayloadMode,
    dropout_channel: String,
}

impl Default for LabConfig {
    fn default() -> Self {
        Self {
            api_base_url: "http://localhost:8000/api/v1".to_string(),
            api_key: String::new(),
            site_id: String::new(),
            machine_id: String::new(),
            sensor_ids: BTreeMap::from([
                ("temperature".to_string(), String::new()),
                ("vibration".to_string(), String::new()),
                ("current".to_string(), String::new()),
                ("rpm".to_string(), String::new()),
                ("pressure".to_string(), String::new()),
            ]),
            interval_ms: 2000,
            forward_to_sentinel: false,
            include_pressure: false,
            payload_mode: PayloadMode::PerChannel,
            dropout_channel: "vibration".to_string(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Frame {
    sequence: u64,
    timestamp: String,
    scenario: String,
    values: BTreeMap<String, f64>,
    omitted_channels: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct LogEntry {
    time: String,
    level: String,
    message: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
struct Counters {
    frames_generated: u64,
    events_attempted: u64,
    events_accepted: u64,
    events_failed: u64,
    events_skipped: u64,
}

struct LabState {
    config: LabConfig,
    running: bool,
    scenario: Scenario,
    scenario_ticks: u64,
    sequence: u64,
    last_tick: Option<Instant>,
    frames: VecDeque<Frame>,
    logs: VecDeque<LogEntry>,
    counters: Counters,
    last_delivery: String,
}

impl LabState {
    fn new() -> Self {
        let mut s = Self {
            config: LabConfig::default(),
            running: false,
            scenario: Scenario::default(),
            scenario_ticks: 0,
            sequence: 0,
            last_tick: None,
            frames: VecDeque::new(),
            logs: VecDeque::new(),
            counters: Counters::default(),
            last_delivery: "Dry-run mode. Readings are generated locally and are not sent to Sentinel.".to_string(),
        };
        s.log("INFO", "Sentinel Lab ready. Configure your Sentinel IDs, then start in dry-run mode first.");
        s
    }

    fn log(&mut self, level: &str, message: impl Into<String>) {
        let entry = LogEntry {
            time: Utc::now().format("%H:%M:%S").to_string(),
            level: level.to_string(),
            message: message.into(),
        };
        self.logs.push_front(entry);
        while self.logs.len() > MAX_LOGS { self.logs.pop_back(); }
    }
}

#[derive(Serialize)]
struct PublicConfig {
    api_base_url: String,
    site_id: String,
    machine_id: String,
    sensor_ids: BTreeMap<String, String>,
    interval_ms: u64,
    forward_to_sentinel: bool,
    include_pressure: bool,
    payload_mode: PayloadMode,
    dropout_channel: String,
    api_key_configured: bool,
}

impl From<&LabConfig> for PublicConfig {
    fn from(c: &LabConfig) -> Self {
        Self {
            api_base_url: c.api_base_url.clone(),
            site_id: c.site_id.clone(),
            machine_id: c.machine_id.clone(),
            sensor_ids: c.sensor_ids.clone(),
            interval_ms: c.interval_ms,
            forward_to_sentinel: c.forward_to_sentinel,
            include_pressure: c.include_pressure,
            payload_mode: c.payload_mode.clone(),
            dropout_channel: c.dropout_channel.clone(),
            api_key_configured: !c.api_key.trim().is_empty(),
        }
    }
}

#[derive(Serialize)]
struct Snapshot {
    running: bool,
    scenario: Scenario,
    scenario_label: &'static str,
    sequence: u64,
    config: PublicConfig,
    counters: Counters,
    frames: Vec<Frame>,
    logs: Vec<LogEntry>,
    last_delivery: String,
}

#[derive(Deserialize)]
struct ConfigInput {
    api_base_url: String,
    #[serde(default)] api_key: String,
    site_id: String,
    machine_id: String,
    sensor_ids: BTreeMap<String, String>,
    interval_ms: u64,
    forward_to_sentinel: bool,
    include_pressure: bool,
    payload_mode: PayloadMode,
    dropout_channel: String,
    #[serde(default)] clear_api_key: bool,
}

#[derive(Deserialize)]
struct ScenarioInput {
    scenario: Scenario,
    #[serde(default)] dropout_channel: Option<String>,
}

async fn index() -> Html<&'static str> { Html(HTML) }

async fn get_state(State(app): State<AppState>) -> Json<Snapshot> {
    let state = app.inner.lock().await;
    Json(Snapshot {
        running: state.running,
        scenario: state.scenario.clone(),
        scenario_label: state.scenario.label(),
        sequence: state.sequence,
        config: PublicConfig::from(&state.config),
        counters: state.counters.clone(),
        frames: state.frames.iter().cloned().collect(),
        logs: state.logs.iter().cloned().collect(),
        last_delivery: state.last_delivery.clone(),
    })
}

async fn save_config(
    State(app): State<AppState>,
    Json(input): Json<ConfigInput>,
) -> (StatusCode, Json<Value>) {
    let mut state = app.inner.lock().await;
    let previous_key = state.config.api_key.clone();
    let api_key = if input.clear_api_key {
        String::new()
    } else if input.api_key.trim().is_empty() {
        previous_key
    } else {
        input.api_key.trim().to_string()
    };
    state.config = LabConfig {
        api_base_url: input.api_base_url.trim().trim_end_matches('/').to_string(),
        api_key,
        site_id: input.site_id.trim().to_string(),
        machine_id: input.machine_id.trim().to_string(),
        sensor_ids: input.sensor_ids,
        interval_ms: input.interval_ms.clamp(500, 60_000),
        forward_to_sentinel: input.forward_to_sentinel,
        include_pressure: input.include_pressure,
        payload_mode: input.payload_mode,
        dropout_channel: input.dropout_channel,
    };
    state.log("INFO", "Configuration saved. API key is kept in server memory and is never returned by the status API.");
    (StatusCode::OK, Json(json!({"ok": true, "message": "Configuration saved."})))
}

async fn set_scenario(
    State(app): State<AppState>,
    Json(input): Json<ScenarioInput>,
) -> (StatusCode, Json<Value>) {
    let mut state = app.inner.lock().await;
    state.scenario = input.scenario;
    state.scenario_ticks = 0;
    if let Some(channel) = input.dropout_channel {
        if !channel.trim().is_empty() { state.config.dropout_channel = channel.trim().to_string(); }
    }
    let label = state.scenario.label();
    state.log("INFO", format!("Scenario selected: {label}. Scenario progression has been reset."));
    (StatusCode::OK, Json(json!({"ok": true, "message": format!("Scenario set to {label}.")})))
}

async fn start_simulation(State(app): State<AppState>) -> (StatusCode, Json<Value>) {
    let mut state = app.inner.lock().await;
    if state.config.forward_to_sentinel {
        if state.config.api_key.trim().is_empty() {
            return (StatusCode::BAD_REQUEST, Json(json!({"ok": false, "message": "Forwarding is enabled, but no API key is configured."})));
        }
        if state.config.site_id.is_empty() || state.config.machine_id.is_empty() {
            return (StatusCode::BAD_REQUEST, Json(json!({"ok": false, "message": "Forwarding requires the real Sentinel site ID and machine ID."})));
        }
        if let Err(msg) = validate_sensor_ids(&state.config) {
            return (StatusCode::BAD_REQUEST, Json(json!({"ok": false, "message": msg})));
        }
    }
    state.running = true;
    state.last_tick = None;
    let mode = if state.config.forward_to_sentinel { "LIVE FORWARDING" } else { "DRY RUN" };
    state.last_delivery = if state.config.forward_to_sentinel {
        "Live forwarding is enabled. Watch the event counters and delivery log.".to_string()
    } else {
        "Dry-run mode. Readings are generated locally and are not sent to Sentinel.".to_string()
    };
    state.log("INFO", format!("Simulator started in {mode} mode using scenario: {}.", state.scenario.label()));
    (StatusCode::OK, Json(json!({"ok": true, "message": format!("Simulation started ({mode}).")})))
}

async fn stop_simulation(State(app): State<AppState>) -> Json<Value> {
    let mut state = app.inner.lock().await;
    state.running = false;
    state.log("WARN", "Simulator stopped by operator.");
    Json(json!({"ok": true, "message": "Simulation stopped."}))
}

async fn reset_simulation(State(app): State<AppState>) -> Json<Value> {
    let mut state = app.inner.lock().await;
    state.running = false;
    state.scenario = Scenario::Normal;
    state.scenario_ticks = 0;
    state.sequence = 0;
    state.frames.clear();
    state.counters = Counters::default();
    state.last_delivery = "Counters and local history reset. Existing data in Sentinel is not deleted.".to_string();
    state.log("WARN", "Local counters and chart history reset. No Sentinel database records were deleted.");
    Json(json!({"ok": true, "message": "Local state reset. Sentinel data was not changed."}))
}

fn validate_sensor_ids(config: &LabConfig) -> Result<(), String> {
    let required: Vec<&str> = match config.payload_mode {
        PayloadMode::MultiChannel => vec!["temperature"],
        PayloadMode::PerChannel if config.include_pressure => {
            vec!["temperature", "vibration", "current", "rpm", "pressure"]
        }
        PayloadMode::PerChannel => vec!["temperature", "vibration", "current", "rpm"],
    };
    for channel in required {
        let id = config.sensor_ids.get(channel).map(String::as_str).unwrap_or("").trim();
        if id.is_empty() {
            return Err(format!("Missing sensor ID for '{channel}'. Paste the actual sensor IDs from Sentinel, or switch to dry-run."));
        }
    }
    Ok(())
}

fn noise(seq: u64, phase: f64, amplitude: f64) -> f64 {
    ((seq as f64 * 1.618 + phase).sin() * 0.61 + (seq as f64 * 0.37 + phase * 2.0).cos() * 0.39) * amplitude
}

fn generate_frame(state: &mut LabState) -> Frame {
    state.sequence += 1;
    state.scenario_ticks += 1;
    let seq = state.sequence;
    let t = state.scenario_ticks as f64;
    let load = 0.55 + 0.06 * (t / 8.0).sin();
    let mut temperature = 52.0 + 13.0 * load + noise(seq, 0.4, 0.65);
    let mut vibration = 1.35 + 0.75 * load + noise(seq, 1.7, 0.13);
    let mut current = 7.0 + 7.0 * load + noise(seq, 2.4, 0.35);
    let mut rpm = 1480.0 - 12.0 * load + noise(seq, 3.5, 3.0);
    let mut pressure = 6.2 + 0.5 * load + noise(seq, 4.1, 0.08);

    match state.scenario {
        Scenario::Normal => {}
        Scenario::VibrationRamp => {
            vibration += (t * 0.16).min(9.0);
            temperature += (t * 0.20).min(15.0);
        }
        Scenario::Overheating => {
            temperature += (t * 1.05).min(48.0);
            current += (t * 0.08).min(3.0);
        }
        Scenario::Overload => {
            current += (t * 0.65).min(18.0);
            temperature += (t * 0.45).min(28.0);
            rpm -= (t * 1.5).min(100.0);
        }
        Scenario::SensorDropout => {}
        Scenario::Startup => {
            let progress = (t / 8.0).min(1.0);
            rpm = 1480.0 * progress + noise(seq, 3.5, 2.0);
            current += (1.0 - progress) * 13.0;
            temperature -= (1.0 - progress) * 8.0;
        }
        Scenario::CombinedFault => {
            vibration += (t * 0.18).min(10.0);
            temperature += (t * 0.72).min(38.0);
            current += (t * 0.30).min(9.0);
            rpm -= (t * 1.15).min(85.0);
            pressure -= (t * 0.01).min(0.8);
        }
    }

    let mut values = BTreeMap::new();
    values.insert("temperature".to_string(), round2(temperature.max(0.0)));
    values.insert("vibration".to_string(), round2(vibration.max(0.0)));
    values.insert("current".to_string(), round2(current.max(0.0)));
    values.insert("rpm".to_string(), round2(rpm.max(0.0)));
    values.insert("pressure".to_string(), round2(pressure.max(0.0)));

    let mut omitted_channels = Vec::new();
    if matches!(state.scenario, Scenario::SensorDropout) {
        omitted_channels.push(state.config.dropout_channel.clone());
    }
    if !state.config.include_pressure { values.remove("pressure"); }

    Frame {
        sequence: seq,
        timestamp: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        scenario: state.scenario.label().to_string(),
        values,
        omitted_channels,
    }
}

fn round2(v: f64) -> f64 { (v * 100.0).round() / 100.0 }

fn build_events(frame: &Frame, config: &LabConfig) -> Vec<(String, Value)> {
    let omitted: Vec<String> = frame.omitted_channels.clone();
    let mut channels: Vec<String> = frame.values.keys().cloned().collect();
    if matches!(config.payload_mode, PayloadMode::PerChannel) {
        channels.retain(|c| !omitted.contains(c));
        channels.into_iter().filter_map(|channel| {
            let sensor_id = config.sensor_ids.get(&channel)?.trim();
            if sensor_id.is_empty() { return None; }
            let value = *frame.values.get(&channel)?;
            let mut channel_values = serde_json::Map::new();
            channel_values.insert(channel.clone(), json!(value));
            let payload = json!({
                "siteId": config.site_id,
                "machineId": config.machine_id,
                "sensorId": sensor_id,
                "timestamp": frame.timestamp,
                "type": "sensor_reading",
                "values": Value::Object(channel_values),
                "source": "gateway"
            });
            Some((channel, payload))
        }).collect()
    } else {
        channels.retain(|c| !omitted.contains(c));
        if channels.is_empty() { return vec![]; }
        let sensor_id = config.sensor_ids.get("temperature").map(String::as_str).unwrap_or("").trim();
        if sensor_id.is_empty() { return vec![]; }
        let mut values = serde_json::Map::new();
        for channel in channels {
            if let Some(v) = frame.values.get(&channel) { values.insert(channel, json!(v)); }
        }
        vec![("multi-channel".to_string(), json!({
            "siteId": config.site_id,
            "machineId": config.machine_id,
            "sensorId": sensor_id,
            "timestamp": frame.timestamp,
            "type": "sensor_reading",
            "values": values,
            "source": "gateway"
        }))]
    }
}

async fn engine(app: AppState) {
    loop {
        sleep(Duration::from_millis(150)).await;
        let pending = {
            let mut state = app.inner.lock().await;
            if !state.running { None }
            else {
                let interval = Duration::from_millis(state.config.interval_ms.clamp(500, 60_000));
                let due = state.last_tick.map(|t| t.elapsed() >= interval).unwrap_or(true);
                if !due { None }
                else {
                    state.last_tick = Some(Instant::now());
                    let frame = generate_frame(&mut state);
                    state.counters.frames_generated += 1;
                    let note = format!(
                        "Frame #{} generated — temperature {:.2} °C, vibration {:.2}, current {:.2} A, RPM {:.0}{}.",
                        frame.sequence,
                        frame.values.get("temperature").copied().unwrap_or(0.0),
                        frame.values.get("vibration").copied().unwrap_or(0.0),
                        frame.values.get("current").copied().unwrap_or(0.0),
                        frame.values.get("rpm").copied().unwrap_or(0.0),
                        if frame.omitted_channels.is_empty() { String::new() } else { format!(", omitted: {}", frame.omitted_channels.join(", ")) },
                    );
                    state.log("DATA", note);
                    state.frames.push_back(frame.clone());
                    while state.frames.len() > MAX_FRAMES { state.frames.pop_front(); }
                    let config = state.config.clone();
                    let events = build_events(&frame, &config);
                    Some((frame, config, events))
                }
            }
        };

        if let Some((frame, config, events)) = pending {
            if !config.forward_to_sentinel {
                let mut state = app.inner.lock().await;
                state.counters.events_skipped += events.len() as u64;
                state.last_delivery = "Dry run: local data is updating. No requests have been sent to Sentinel.".to_string();
            } else {
                if events.is_empty() {
                    let mut state = app.inner.lock().await;
                    state.counters.events_skipped += 1;
                    state.last_delivery = "No events sent. Check sensor IDs, payload mode, and dropout settings.".to_string();
                    state.log("WARN", "No events produced for forwarding. Check the configured sensor IDs.");
                }
                for (channel, payload) in events {
                    let seq = frame.sequence;
                    {
                        let mut state = app.inner.lock().await;
                        state.counters.events_attempted += 1;
                    }
                    let key = format!("sentinel-lab-{}-{}-{}", config.machine_id, seq, channel);
                    let url = format!("{}/events", config.api_base_url.trim_end_matches('/'));
                    let response = app.client
                        .post(url)
                        .bearer_auth(&config.api_key)
                        .header("Idempotency-Key", key)
                        .json(&payload)
                        .send()
                        .await;
                    match response {
                        Ok(resp) => {
                            let status = resp.status();
                            let body = resp.text().await.unwrap_or_default();
                            let mut state = app.inner.lock().await;
                            if status.is_success() {
                                state.counters.events_accepted += 1;
                                state.last_delivery = format!("Last event accepted by API: HTTP {} ({channel}).", status.as_u16());
                                state.log("SENT", format!("Event #{seq} for '{channel}' accepted by Sentinel API (HTTP {}).", status.as_u16()));
                            } else {
                                state.counters.events_failed += 1;
                                let body_short: String = body.chars().take(240).collect();
                                state.last_delivery = format!("API rejected '{channel}' with HTTP {}. See log for response.", status.as_u16());
                                state.log("ERROR", format!("Event #{seq} for '{channel}' rejected: HTTP {} — {}", status.as_u16(), body_short));
                            }
                        }
                        Err(err) => {
                            let mut state = app.inner.lock().await;
                            state.counters.events_failed += 1;
                            state.last_delivery = format!("Could not reach Sentinel API: {err}");
                            state.log("ERROR", format!("Event #{seq} for '{channel}' failed to send: {err}"));
                        }
                    }
                }
            }
        }
    }
}

#[tokio::main]
async fn main() {
    let bind = env::var("SENTINEL_LAB_BIND").unwrap_or_else(|_| "127.0.0.1:8787".to_string());
    let app_state = AppState {
        inner: Arc::new(Mutex::new(LabState::new())),
        client: reqwest::Client::builder()
            .timeout(Duration::from_secs(8))
            .build()
            .expect("build HTTP client"),
    };

    tokio::spawn(engine(app_state.clone()));

    let app = Router::new()
        .route("/", get(index))
        .route("/api/state", get(get_state))
        .route("/api/config", post(save_config))
        .route("/api/scenario", post(set_scenario))
        .route("/api/start", post(start_simulation))
        .route("/api/stop", post(stop_simulation))
        .route("/api/reset", post(reset_simulation))
        .with_state(app_state);

    let addr: SocketAddr = bind.parse().expect("SENTINEL_LAB_BIND must be a valid socket address");
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind listener");
    println!("Sentinel Lab is running at http://{addr}");
    if addr.ip().is_unspecified() {
        println!("WARNING: listening on every interface. Use only on a trusted private network; this control panel has no login.");
    }
    axum::serve(listener, app).await.expect("serve Sentinel Lab");
}
