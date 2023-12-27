// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

const TEAM_ID: &str = "2117";
const TOPIC: &str = "team/2117";
// const HOST: &str = "cansat.info";
const HOST: &str = "localhost";
const PORT: u32 = 1883;

const USERNAME: &str = "2117";
const PASSWORD: &str = "2117";

const FPATH: &str = "../flight logs/out.csv";
const SIMPFILE: &str = "../simp.txt";

const BAUD_RATE: u32 = 9600;
const CSV_HEAD:&str = "TEAM_ID, MISSION_TIME, PACKET_COUNT, MODE, STATE, ALTITUDE, AIR_SPEED, HS_DEPLOYED, PC_DEPLOYED, TEMPERATURE, VOLTAGE, PRESSURE, GPS_TIME, GPS_ALTITUDE, GPS_LATITUDE, GPS_LONGITUDE, GPS_SATS, TILT_X, TILT_Y, ROT_Z, CMD_ECHO";

use chrono::Local;
use futures::executor::block_on;
use paho_mqtt as mqtt;
use serialport::available_ports;
use std::fs::File;
use std::fs::OpenOptions;
use std::io::prelude::*;
use std::io::Write;
use std::time::Duration;
use std::{path::PathBuf, sync::Mutex};
use tauri::Manager;
use tauri::State;

#[macro_use]
extern crate lazy_static;

#[derive(Default)]
struct StatePortName(Mutex<String>);

#[derive(Default)]
struct ReloadPort(Mutex<bool>);

#[derive(Default)]
struct Data(Mutex<String>);

#[derive(Default)]
struct CommandToWrite(Mutex<String>);

#[derive(Default)]
struct MqtConnected(Mutex<bool>);

#[derive(Default)]
struct SimVars(Mutex<Vec<String>>);

lazy_static! {
    static ref MQTT: mqtt::AsyncClient = mqtt::CreateOptionsBuilder::new()
        .server_uri(format!("{}:{}", HOST, PORT))
        .client_id(TOPIC)
        .create_client()
        .unwrap();
}

#[tauri::command]
fn set_port(
    new_port_name: &str,
    s: State<StatePortName>,
    r: State<ReloadPort>,
    d: State<Data>,
    // sim: State<SimVars>,
) {
    let mut state_port_name = s.0.lock().unwrap();
    let mut reload = r.0.lock().unwrap();
    let mut data = d.0.lock().unwrap();
    data.clear();
    state_port_name.clear();
    if new_port_name == "NONE" {
        state_port_name.push_str("NONE");
        *reload = true;
        println!("port set: {}", state_port_name);
        return;
    }
    // if new_port_name == "SIMULATE" {
    //     state_port_name.push_str("SIMULATE");
    //     let simfile = std::fs::read_to_string(SIMPFILE).expect("Unable to read file");
    //     println!("SIMULATING PORT READING FROM FILE: {}", SIMPFILE);
    //     // println!("{}", simfile);
    //     let mut sim_vars = sim.0.lock().unwrap();
    //     sim_vars.clear();
    //     for line in simfile.lines() {
    //         sim_vars.push(line.to_owned());
    //     }
    //     sim_vars.remove(0);
    //     return;
    // }
    let base = PathBuf::from(&new_port_name);
    state_port_name.push_str(&base.display().to_string());
    *reload = true;
    println!("port set: {}", state_port_name);
    // let mut state_port_name = s.0.lock().unwrap().clone();
    // let base = PathBuf::from(new_port_name);
    // *state_port_name = base.display().to_string();
    // println!("port set: {}", new_port_name);
}

#[tauri::command]
fn read_serial(
    s: State<Data>,
    // p: State<StatePortName>, sim: State<SimVars>
) -> String {
    // let port = p.0.lock().unwrap().clone();
    // if port == "SIMULATE" {
    //     let mut sim_vars = sim.0.lock().unwrap();

    //     if sim_vars.len() > 1 {
    //         let sim_data = sim_vars.remove(0);
    //         sim_vars.push(sim_data.clone());
    //         return sim_data.replace("\n", "").replace("\r", "");
    //     }
    //     return sim_vars[0].clone();
    // }
    let data = s.0.lock().unwrap().clone();
    println!("data_read_serial: {}", data.replace("\n", ""));
    return data.replace("\n", "").replace("\r", "");
}

#[tauri::command]
fn write_serial(write_data: &str, w: State<CommandToWrite>, s: State<StatePortName>) {
    // check is serial is connected
    let state_port_name = s.0.lock().unwrap().clone();
    if state_port_name.is_empty() || state_port_name == "NONE" {
        println!("Serial port not set");
        return;
    }
    println!("write_serial: {}", write_data);
    let mut command_to_write = w.0.lock().unwrap();
    command_to_write.clear();
    command_to_write.push_str(write_data);
}

#[tauri::command]
fn send_command(telem: String, w: State<CommandToWrite>) {
    println!("send_command: {}", telem);
    let mut command_to_write = w.0.lock().unwrap();
    command_to_write.clear();
    command_to_write.push_str("CMD,");
    command_to_write.push_str(TEAM_ID);
    command_to_write.push_str(",");
    command_to_write.push_str(telem.as_str());
    command_to_write.push_str("\n");
}

#[tauri::command]
fn get_ports() -> Vec<String> {
    let mut a = vec![];
    if let Ok(ports) = available_ports() {
        if ports.is_empty() {
            println!("No serial ports found.");
        } else {
            // println!("\nAvailable serial ports:");
            for port in ports {
                if port.port_name.contains("tty") {
                    println!("{}", port.port_name);
                    a.push(port.port_name);
                }
            }
        }
    } else {
        println!("Error listing serial ports.");
    }
    return a;
}

fn new_file() {
    if PathBuf::from(FPATH).exists() {
        std::fs::rename(
            FPATH,
            Local::now()
                .format("../flight logs/%Y-%m-%d_%H:%M:%S")
                .to_string()
                + ".bak.csv",
        )
        .expect("Unable to rename file");
    }
    let mut f = File::create(FPATH).expect("Unable to create file");
    f.write(CSV_HEAD.as_bytes()).expect("Unable to write data");
}

fn write_data(data: &str) {
    let mut file = OpenOptions::new()
        .write(true)
        .append(true)
        .open(FPATH)
        .expect("open failed");
    file.write(("\n".to_owned() + data).as_bytes())
        .expect("write failed");
    let msg = mqtt::MessageBuilder::new()
        .topic(TOPIC)
        .payload(data)
        .qos(1)
        .finalize();
    if MQTT.is_connected() {
        MQTT.publish(msg);
    }
}

#[tauri::command]
fn connect_mqtt(conn: State<MqtConnected>) {
    let conn_opts = mqtt::ConnectOptionsBuilder::new()
        .keep_alive_interval(Duration::from_secs(60))
        // .user_name(USERNAME)
        // .password(PASSWORD)
        .finalize();

    match block_on(MQTT.connect(conn_opts)) {
        Ok(_) => {
            println!("Connected to MQTT");
            let mut mqt_connected = conn.0.lock().unwrap();
            *mqt_connected = true;
        }
        Err(e) => {
            println!("Unable to connect to MQTT: {:?}", e);
            let mut mqt_connected = conn.0.lock().unwrap();
            *mqt_connected = false;
        }
    }
}

#[tauri::command]
fn disconnect_mqtt(conn: State<MqtConnected>) {
    MQTT.disconnect(None);
    let mut mqt_connected = conn.0.lock().unwrap();
    *mqt_connected = MQTT.is_connected();
}

#[tauri::command]
fn get_mqtt_status() -> bool {
    let mqt_connected = MQTT.is_connected();
    return mqt_connected;
}

fn main() {
    new_file();

    tauri::Builder::default()
        .manage(StatePortName(Default::default()))
        .manage(ReloadPort(Default::default()))
        .manage(Data(Default::default()))
        .manage(CommandToWrite(Default::default()))
        .manage(MqtConnected(Default::default()))
        .manage(SimVars(Default::default()))
        .invoke_handler(tauri::generate_handler![
            get_ports,
            set_port,
            read_serial,
            write_serial,
            send_command,
            connect_mqtt,
            disconnect_mqtt,
            get_mqtt_status,
        ])
        .setup(|app| {
            let app_handle = app.handle();
            tauri::async_runtime::spawn(async move {
                let mut data = "".to_owned();
                let mut first_run = true;
                loop {
                    let binding = app_handle.state::<StatePortName>();
                    let state_port_name = binding.0.lock().unwrap().clone();
                    if !state_port_name.is_empty() {
                        break;
                    }
                    // println!("port not defined");
                    std::thread::sleep(Duration::from_millis(500));
                }
                loop {
                    let binding = app_handle.state::<StatePortName>();
                    let state_port_name = binding.0.lock().unwrap().clone();
                    let port = serialport::new(state_port_name.to_string(), BAUD_RATE).open();
                    std::thread::sleep(Duration::from_millis(3500));
                    match port {
                        Ok(mut _port) => {
                            println!("port exists");
                            match _port.write_data_terminal_ready(true) {
                                Ok(_) => {}
                                Err(_) => {
                                    println!("port not opened");
                                    break;
                                }
                            }
                            match _port.write_request_to_send(true) {
                                Ok(_) => {}
                                Err(_) => {
                                    println!("port not opened");
                                    break;
                                }
                            }
                            println!("okay");
                            loop {
                                let binding = app_handle.state::<ReloadPort>();
                                let mut reload = binding.0.lock().unwrap();
                                // println!("reload: {}", *reload);
                                // println!("first_run: {}", first_run);
                                let binding = app_handle.state::<CommandToWrite>();
                                let mut command_to_write = binding.0.lock().unwrap();
                                if !command_to_write.is_empty() {
                                    println!("command_to_write: {}", command_to_write);
                                    let cmd = command_to_write.clone() + "\n";
                                    command_to_write.clear();
                                    // command_to_write.push_str("OK\n");
                                    _port.write_all(cmd.as_bytes()).expect("Write failed!");
                                }
                                if first_run {
                                    first_run = false;
                                }
                                if !first_run && *reload {
                                    let binding = app_handle.state::<StatePortName>();
                                    let state_port_name = binding.0.lock().unwrap();
                                    println!("port reloading: {}", state_port_name);
                                    *reload = false;
                                    first_run = false;
                                    break;
                                }
                                if state_port_name == "NONE" || state_port_name.is_empty() {
                                    continue;
                                }
                                let avail_bytes = _port.bytes_to_read().unwrap();
                                if avail_bytes > 0 {
                                    // println!("avail_bytes: {}", avail_bytes);
                                    let mut serial_buf: Vec<u8> =
                                        vec![0; avail_bytes.try_into().unwrap()];
                                    _port
                                        .read_exact(serial_buf.as_mut_slice())
                                        .expect("Found no data!");
                                    let b2s = std::str::from_utf8(&serial_buf);
                                    let b2s2 = b2s.unwrap_or_default();
                                    data.push_str(b2s2);
                                    if b2s2.contains("\n") {
                                        let d = data.replace("\n", "");
                                        // println!("data: {}", d);
                                        ////////////////// MQTT
                                        write_data(d.as_str());
                                        let binding = app_handle.state::<Data>();
                                        let mut data_state = binding.0.lock().unwrap();
                                        data_state.clear();
                                        data_state.push_str(&data);
                                        data.clear();
                                    }
                                }
                            }
                        }
                        Err(_) => {
                            println!("port not opened")
                        }
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
