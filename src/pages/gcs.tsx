import { Suspense, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import toast, { Toaster } from "react-hot-toast";
import Switch from "react-switch"
import { MapContainer, TileLayer, Marker, Popup, useMap, CircleMarker } from 'react-leaflet'
import "leaflet/dist/leaflet.css";
import { Canvas } from "@react-three/fiber"
import { Environment, OrbitControls } from "@react-three/drei"
import reload from "../assets/reload.png";
// import { AreaChart, Area, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts"
// import SmoothieComponent, { TimeSeries } from "react-smoothie";
import { type RecvData } from "../types";
import Model from "../assets/Dummysat.tsx"

const pre = `TERMINAL
A
B
C
>>> D
`

const Data = ({ children }: { children: React.ReactNode }) => {
  return <div className=" text-green-500 ring-1 px-2 p-0.5 m-0.5 rounded ring-green-500/50">{children}</div>
}

function GCS() {
  const [serialPorts, setSerialPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>("none");
  const [result, setResult] = useState<string>("");
  const [reading, setReading] = useState(false);
  const [intrvl, setIntrvl] = useState<any>(0);
  const [primData, setPrimData] = useState<RecvData>();
  const [telemetry, setTelemetry] = useState(true);
  const [mqttConnected, setMqttConnected] = useState(false);

  if (!window.__TAURI_IPC__) window.location.href = "/web";

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
    const data = result.split(",,")
    const pd = data[0].split(",")
    const ed = data[1] ? data[1].split(",") : ["", ""]
    const primaryData: RecvData = {
      teamID: parseInt(pd[0]),
      time: pd[1],
      packetCount: parseInt(pd[2]),
      flightMode: pd[3] as "S" | "F",
      state: pd[4],
      altitude: parseFloat(pd[5]),
      airSpeed: parseFloat(pd[6]),
      hsDeployed: pd[7] as "P" | "N",
      pcDeployed: pd[8] as "C" | "N",
      temperature: parseFloat(pd[9]),
      pressure: parseFloat(pd[10]),
      voltage: parseFloat(pd[11]),
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
      toast(ed[0], { icon: "ℹ️" })
      invoke("send_command", { telem: "ACK" });
    }
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

  function setPort(port_name: string) {
    // if (port_name === "NONE") return;
    invoke("set_port", { newPortName: port_name }).then(() => {
      setSelectedPort(port_name);
      setReading(true);
    });
  }

  // const ts1 = new TimeSeries({});
  // const ts2 = new TimeSeries({
  //   resetBounds: true,
  //   resetBoundsInterval: 1000,
  // })

  // setInterval(() => {
  //     var time = new Date().getTime();

  //     ts1.append(time, Math.random());
  //     ts2.append(time, Math.random());
  // }, 1000)

  return <div className="flex w-screen h-screen justify-center">
    <Toaster />
    <div className="flex flex-col grow">
      <div className="p-1 flex justify-start items-center gap-2">
        <div id="battery" className="bg-black overflow-clip h-[30px] w-20 ring-1 ring-white/70 m-1 rounded relative z-0 flex items-center justify-center">
          <div className="font-bold">12.0V</div>
          <div className="bg-green-600 rounded h-[30px] w-[69%] absolute left-0 top-0 -z-10"></div>
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
          <option value="NONE">none</option>
          <option value="SIMULATE">simluate</option>
          {serialPorts.map((port_name) => (
            <option key={port_name} value={port_name}>
              {port_name}
            </option>
          ))}
        </select>
        <button onClick={connect_mqtt} className="bg-green-300 h-fit text-black rounded active:bg-black active:text-green-500 ring-1 px-1 ring-green-500">
          {mqttConnected ? "MQTT ✅" : "Connect MQTT"}
        </button>

      </div>
      <div className="grow relative">

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
      <div className="bg-black/60 flex flex-col text-justify font-extralight text-green-400 p-1 px-2 overflow-scroll w-full">
        <pre className="grow">
          {pre}
        </pre>
        <input type="text" className="bg-black ring-1 ring-white/20 text-green-400 outline-none w-full" onKeyDown={(e) => {
          if (e.key === "Enter") {
            invoke("write_serial", { writeData: e.currentTarget.value });
            e.currentTarget.value = "";
          }
        }} />
      </div>
    </div>
  </div>
}

export default GCS;
