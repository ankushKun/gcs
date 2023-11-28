import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import toast, { Toaster } from "react-hot-toast";
import reload from "../assets/reload.png";
// import { AreaChart, Area, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts"
// import SmoothieComponent, { TimeSeries } from "react-smoothie";
import { type RecvData } from "../types";

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

  return (
    <div className="p-2 flex flex-col gap-1">
      <Toaster />
      <div className="flex justify-start gap-2">
        <button className="" onClick={() => getPorts()}>
          <img
            src={reload}
            className="active:rotate-90 invert"
            width={16}
            height={16}
          />
        </button>
        <select
          className="text-black bg-green-400"
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
        <button onClick={connect_mqtt} className="bg-green-300 text-black rounded active:bg-black active:text-green-500 ring-1 px-1 ring-green-500">
          {mqttConnected ? "MQTT ✅" : "Connect MQTT"}
        </button>
        {/* <input
          type="text"
          className="ml-auto rounded px-1 text-black outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              invoke("write_serial", { writeData: e.currentTarget.value });
              e.currentTarget.value = "";
            }
          }}
        /> */}
        <div>
          <input type="checkbox" id="telemetry" onChange={e => {

            invoke("send_command", { telem: `CX,${e.target.checked ? "ON" : "OFF"}` });
          }} />
          <label htmlFor="telemetry">Telemetry</label>
        </div>
      </div>
      {primData && (
        <>
          <div className="flex gap-1 text-black">
            <Data>
              Team ID: {primData.teamID}
            </Data>
            <Data>
              Packet: {primData.packetCount}
            </Data>
            <Data>
              T: {primData.time} | GPS: {primData.gpsTime}
            </Data>
            <Data>{primData.state}</Data>
            <Data>
              Last CMD: {primData.cmdEcho}
            </Data>
          </div>
          <div>
            ok
          </div>
        </>
      )}

      <div className="fixed bottom-0 mx-auto w-full text-center text-sm text-white/70">
        <div>{result}</div>
        <div>{primData?.debugMsg}</div>
      </div>
    </div>
  );
}

export default GCS;
