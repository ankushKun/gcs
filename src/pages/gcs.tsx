import { Suspense, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import toast, { Toaster } from "react-hot-toast";
import Switch from "react-switch"
import { MapContainer, TileLayer, Marker, Popup, useMap, CircleMarker } from 'react-leaflet'
import "leaflet/dist/leaflet.css";
import { Canvas } from "@react-three/fiber"
import { Environment, OrbitControls } from "@react-three/drei"
import reload from "../assets/reload.png";
// import { AreaChart, Area, CartesianGrid, Tooltip, XAxis, YAxis, LineChart, Line, Legend, ResponsiveContainer } from "recharts"
import SmoothieComponent, { TimeSeries } from "react-smoothie";
import { type RecvData } from "../types";
import Model from "../assets/Dummysat.tsx"
import { simpdata } from "../../simp.ts"

const teamId = 2117;

const consoleInit =
  `    > CONSOLE <

>> Incoming telemetry
<< Outgoing telemetry
## Debug Message

=====================
`

// function useScreenSize() {
//   const [size, setSize] = useState<{ width: number, height: number }>({ width: window.innerWidth, height: window.innerHeight });
//   useEffect(() => {
//     const handleResize = () => {
//       setSize({ width: window.innerWidth, height: window.innerHeight })
//     }
//     window.addEventListener("resize", handleResize);
//     return () => window.removeEventListener("resize", handleResize);
//   }, []);
//   return size;
// }

const timesconfig = {
  resetBounds: true,
  resetBoundsInterval: 1000,
}

function GCS() {
  // const { width, height } = useScreenSize();
  const [serialPorts, setSerialPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>("none");
  const [result, setResult] = useState<string>("");
  const [reading, setReading] = useState(false);
  const [intrvl, setIntrvl] = useState<NodeJS.Timeout>();
  const [primData, setPrimData] = useState<RecvData>();
  const [telemetry, setTelemetry] = useState(true);
  const [mqttConnected, setMqttConnected] = useState(false);
  const [simpInterval, setSimpInterval] = useState<NodeJS.Timeout>();
  const [simpRunning, setSimpRunning] = useState(false);
  const [consoleOut, setConsoleOut] = useState<string>(consoleInit);
  const [command, setCommand] = useState<string>("");
  const [temperatureTS, setTemperatureTS] = useState<TimeSeries>(new TimeSeries(timesconfig));
  const [pressureTS, setPressureTS] = useState<TimeSeries>(new TimeSeries(timesconfig));
  const [altitudeTS, setAltitudeTS] = useState<TimeSeries>(new TimeSeries(timesconfig));
  const [airSpeedTS, setAirSpeedTS] = useState<TimeSeries>(new TimeSeries(timesconfig));
  const [gpsAltitudeTS, setGpsAltitudeTS] = useState<TimeSeries>(new TimeSeries(timesconfig));

  if (!window.__TAURI_IPC__) window.location.href = "/web";

  async function writeSerial(data: string) {
    await invoke("write_serial", { writeData: data });
    setConsoleOut((p) => p + "\n<< " + data);
  }

  function clearGraphs() {
    temperatureTS.clear();
    pressureTS.clear();
    altitudeTS.clear();
    airSpeedTS.clear();
    gpsAltitudeTS.clear();
  }

  async function getPorts() {
    const a: string[] = await invoke("get_ports");
    console.log(a);
    setSerialPorts(a);
  }

  async function getMqttStatus() {
    const a: boolean = await invoke("get_mqtt_status");
    // console.log("mqtt:", a)
    setMqttConnected(a);
  }

  async function connect_mqtt() {
    if (!mqttConnected) await invoke("connect_mqtt");
    else await invoke("disconnect_mqtt");
  }

  useEffect(() => {
    setInterval(() => getMqttStatus(), 500);
  }, []);

  useEffect(() => {
    if (!result) return
    console.log(result)
    const data = result.split(",,")
    const pd = data[0].split(",")
    const ed = data[1] ? data[1].split(",") : ["", ""]
    const primaryData: RecvData = {
      teamID: parseInt(pd[0]),
      time: pd[1],
      packetCount: parseInt(pd[2]),
      flightMode: pd[3],
      state: pd[4],
      altitude: parseFloat(pd[5]),
      airSpeed: parseFloat(pd[6]),
      hsDeployed: pd[7],
      pcDeployed: pd[8],
      temperature: parseFloat(pd[9]),
      voltage: parseFloat(pd[10]),
      pressure: parseFloat(pd[11]),
      gpsTime: pd[12],
      gpsAltitude: parseFloat(pd[13]),
      gpsLatitude: parseFloat(pd[14]),
      gpsLongitude: parseFloat(pd[15]),
      gpsSats: parseInt(pd[16]),
      tiltX: parseFloat(pd[17]),
      tiltY: parseFloat(pd[18]),
      rotZ: parseFloat(pd[19]),
      cmdEcho: pd[20],
      debugMsg: ed[0]
    };
    setPrimData(primaryData);
    console.log(primaryData);
    // console.log(ed)
    if (ed[0]) {
      // toast(ed[0], { icon: "ℹ️" })
      setConsoleOut(consoleOut + "\n## " + ed[0]);
      invoke("send_command", { telem: "ACK" });
    }
    //////
    var time = new Date().getTime();
    temperatureTS.append(time, primaryData?.temperature!);
    primaryData?.pressure != 0 && pressureTS.append(time, primaryData?.pressure!);
    airSpeedTS.append(time, primaryData?.airSpeed!);
    altitudeTS.append(time, primaryData?.altitude!);
    gpsAltitudeTS.append(time, primaryData?.gpsAltitude!);

    // temperatureTS.append(time, Math.random() * 10);
    // pressureTS.append(time, Math.random());
    // airSpeedTS.append(time, Math.random());
    // altitudeTS.append(time, Math.random());
    // gpsAltitudeTS.append(time, Math.random());
  }, [result]);

  useEffect(() => {
    getPorts();
  }, []);

  useEffect(() => {
    console.log(selectedPort, reading);
    setResult("");
    if (!selectedPort) {
      setReading(!reading);
      clearInterval(intrvl);
    } else if (reading && selectedPort) {
      clearInterval(intrvl);
      setIntrvl(
        setInterval(() => {
          invoke("read_serial").then((e: any) => {
            // console.log(e)
            setResult(e.toString());
          });
        }, 1000),
      );
      setReading(false);
    }
  }, [selectedPort]);

  async function sendSimpDataPerSecond() {
    const simpList = simpdata.split("\n").filter((e) => e.startsWith("CMD"));
    console.log(simpList);
    let i = 0;
    if (simpRunning) {
      clearInterval(simpInterval!);
      setSimpRunning(false);
      return
    }
    // clearGraphs();
    const si = setInterval(() => {
      if (i >= simpList.length) {
        console.log("Stopped SIMP")
        clearInterval(simpInterval);
        setSimpRunning(false);
        return;
      }
      console.log("writing simp: ", simpList[i]);
      writeSerial(simpList[i]);
      i++;
    }, 1000)
    setSimpRunning(true);
    setSimpInterval(si);
  }

  function setPort(port_name: string) {
    // if (port_name === "NONE") return;
    // if (port_name === "SIMULATE") return sendSimpDataPerSecond();
    clearInterval(simpInterval!);
    setSimpRunning(false);
    invoke("set_port", { newPortName: port_name }).then(() => {
      setSelectedPort(port_name);
      setReading(true);
    });
  }

  return <div className="flex w-screen h-screen justify-center">
    {/* <Toaster /> */}
    <div className="flex flex-col grow">
      <div className="p-1 flex justify-start items-center gap-2">
        <div id="battery" className="bg-black overflow-clip h-[30px] w-20 ring-1 ring-white/70 m-1 rounded relative z-0 flex items-center justify-center">
          <div className="font-bold">12.0V</div>
          <div className="bg-green-600 rounded h-[30px] w-[90%] absolute left-0 top-0 -z-10"></div>
          <div className="absolute -right-1.5 top-2 bg-white h-[13px] w-1.5 rounded-r z-0"></div>
        </div>
        <label htmlFor="telemetry" className="text-white/80 flex items-center gap-1 ml-2 text-xl ring-1 rounded-full p-0.5 pl-1 ring-white/50">
          CX
          <Switch checked={telemetry} defaultChecked onChange={(e) => {
            invoke("send_command", { telem: `CX,${e ? "ON" : "OFF"}` });
            setTelemetry(e);
          }} />
        </label>
        <div className="grow"></div>
        <button className="" onClick={() => getPorts()}>
          <img
            src={reload}
            className="active:rotate-90 invert"
            width={16}
            height={16}
          />
        </button>
        <select
          className="text-black bg-green-400 h-fit py-1"
          onChange={(e) => setPort(e.target.value)}
        >
          <option value="NONE">no port selected</option>
          {/* <option value="SIMULATE">simluate</option> */}
          {serialPorts.map((port_name) => (
            <option key={port_name} value={port_name}>
              {port_name}
            </option>
          ))}
        </select>
        <label htmlFor="sim-enable" >sim enable</label>
        <input id="sim-enable" type="checkbox" onChange={(e) => {

          e.target.checked && writeSerial(`CMD,${teamId},SIM,ENABLE`)
        }} />
        <label htmlFor="sim-activate" >sim activate</label>
        <input id="sim-activate" type="checkbox" onChange={(e) => {
          e.target.checked && writeSerial(`CMD,${teamId},SIM,ACTIVATE`)
        }} />

        <button onClick={sendSimpDataPerSecond} disabled={selectedPort == "none"} className="bg-green-300 h-fit text-black rounded active:bg-black active:text-green-500 ring-1 px-1 ring-green-500">
          {simpRunning ? "SIMP ✅" : "SIMP"}
        </button>
        <button onClick={connect_mqtt} disabled={selectedPort == "none"} className="bg-green-300 h-fit text-black rounded active:bg-black active:text-green-500 ring-1 px-1 ring-green-500">
          {mqttConnected ? "MQTT ✅" : "Connect MQTT"}
        </button>

      </div>
      <div className="grow relative">
        <div className="text-center text-white/80 text-xs">{result}</div>
        <div className="flex gap-2 p-2 justify-center">
          <div className="border border-white/50 rounded">
            <SmoothieComponent responsive className="rounded" millisPerPixel={50}
              height={window.innerWidth * 0.15}
              series={
                [{
                  data: temperatureTS,
                  strokeStyle: { r: 255 },
                  lineWidth: 2
                }]}
              tooltip={props => {
                if (!props.display) return <></>
                const timeString = new Date(props.time as number).toLocaleTimeString();
                return <pre className="relative z-30 w-full bg-black/70 text-white/80 p-1 ring-1 ring-white/20 rounded text-center">
                  {timeString}<br />
                  <span className="text-[#f00]">{parseFloat(props.data![0].value.toString()).toFixed(2)}°C</span>
                </pre>
              }}
            />
            <div className="text-center">Temperature [{primData?.temperature || 0}℃] 🌡</div>
          </div>
          <div className="border border-white/50 rounded">
            <SmoothieComponent responsive className="rounded" millisPerPixel={50}
              height={window.innerWidth * 0.15}
              series={
                [{
                  data: airSpeedTS,
                  strokeStyle: { g: 255, b: 255 },
                  lineWidth: 2
                }]}
              tooltip={props => {
                if (!props.display) return <></>
                const timeString = new Date(props.time as number).toLocaleTimeString();
                return <pre className="relative z-30 w-full bg-black/70 text-white/80 p-1 ring-1 ring-white/20 rounded text-center">
                  {timeString}<br />
                  <span className="text-[#0ff]">{parseFloat(props.data![0].value.toString()).toFixed(2)} kmph</span>
                </pre>
              }}
            />
            <div className="text-center">Air Speed [{primData?.airSpeed || 0} kmph] 🌬</div>
          </div>
          <div className="border border-white/50 rounded">
            <SmoothieComponent responsive className="rounded" millisPerPixel={200} grid={
              { strokeStyle: "rgba(255,255,255,0.1)" }
            } maxValue={95000} minValue={85000} minValueScale={1.5} maxValueScale={1.5}
              height={window.innerWidth * 0.15}
              scaleSmoothing={0.1}
              interpolation="linear"
              nonRealtimeData={false}
              doNotSimplifyData
              streamDelay={10}
              series={
                [{
                  data: pressureTS,
                  strokeStyle: { r: 255, g: 255 },
                  lineWidth: 2
                }]}
              tooltip={props => {
                if (!props.display) return <></>
                const timeString = new Date(props.time as number).toLocaleTimeString();
                return <pre className="relative z-30 w-full bg-black/70 text-white/80 p-1 ring-1 ring-white/20 rounded text-center">
                  {timeString}<br />
                  <span className="text-[#ff0]">{parseFloat(props.data![0].value.toString()).toFixed(2)} Pascals</span>
                </pre>
              }}
            />
            <div className="text-center">Pressure [{primData?.pressure || 0} P] 💨</div>
          </div>
          <div className="border border-white/50 rounded">
            <SmoothieComponent responsive className="rounded" millisPerPixel={50}
              height={window.innerWidth * 0.15}
              series={[
                {
                  data: altitudeTS,
                  strokeStyle: { r: 255 },
                  lineWidth: 2
                },
                {
                  data: gpsAltitudeTS,
                  strokeStyle: { g: 255 },
                  lineWidth: 2
                }
              ]}
              tooltip={props => {
                if (!props.display) return <></>
                const timeString = new Date(props.time as number).toLocaleTimeString();
                return <pre className="relative z-30 w-full bg-black/60 text-white/80 p-1 ring-1 ring-white/20 rounded text-center">
                  {timeString}<br />
                  <span className="text-[#f00]">Pressure: {parseFloat(props.data![0].value.toString()).toFixed(2)}m</span><br />
                  <span className="text-[#0f0]">GPS Alti: {parseFloat(props.data![1].value.toString()).toFixed(2)}m</span>
                </pre>
              }}
            />
            <div className="text-center">Altitude [{primData?.altitude || 0}m] 🗻</div>
          </div>

        </div>
      </div>
    </div>
    <div className=" h-full grid grid-rows-3 max-w-[25%]">
      <div className="">
        <Canvas
          camera={{ position: [0, 0, 16], fov: 18 }}
          style={{
            backgroundColor: "transparent",
          }}>
          <Environment preset="studio" />
          <Suspense fallback={null}>
            <Model rotation={[Math.PI / 4, Math.PI / 4, 0]} />
          </Suspense>
          <OrbitControls enableZoom={false} />
        </Canvas>
        <div className="w-full text-center relative -top-6">PARACHUTE DEPLOYED</div>
      </div>
      <div className="bg-black/10 relative overflow-clip h-full" id="map">
        <MapContainer center={[30.76861111, 76.57388889]} zoom={17} scrollWheelZoom={false} className="h-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
            url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          />
          <CircleMarker center={[30.76861111, 76.57388889]} radius={3} color="red" >
            <Popup>hi</Popup>
          </CircleMarker>
        </MapContainer>

      </div>
      <div className="bg-black/60 flex flex-col-reverse text-justify font-extralight text-green-400 p-1 px-2 overflow-scroll w-full">
        <input type="text" className="bg-black ring-1 ring-white/20 text-green-400 outline-none w-full" value={command}
          onChange={(e) => {
            e.stopPropagation();
            setCommand(e.target.value);
          }}
          onKeyDownCapture={(e) => {
            e.stopPropagation();
            if (!command) return
            if (e.key === "Enter") {
              writeSerial(command);
              setCommand("")
            }
          }}
        />
        <pre className="grow">
          {consoleOut}
        </pre>
      </div>
    </div>
  </div>
}

export default GCS;
