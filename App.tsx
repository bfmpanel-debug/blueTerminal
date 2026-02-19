
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TerminalMessage, MessageType, BleDeviceState } from './types';
import { analyzeBleData } from './services/geminiService';

const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';

const App: React.FC = () => {
  const [messages, setMessages] = useState<TerminalMessage[]>([]);
  const [bleState, setBleState] = useState<BleDeviceState>({
    device: null,
    server: null,
    characteristic: null,
    connected: false,
    deviceName: ''
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const log = useCallback((type: MessageType, content: string) => {
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      type,
      content
    }]);
  }, []);

  const disconnect = useCallback(() => {
    if (bleState.device?.gatt?.connected) {
      bleState.device.gatt.disconnect();
    }
    setBleState({
      device: null,
      server: null,
      characteristic: null,
      connected: false,
      deviceName: ''
    });
    log(MessageType.STATUS, 'Device disconnected.');
  }, [bleState.device, log]);

  const connect = async () => {
    if (!(navigator as any).bluetooth) {
      log(MessageType.ERROR, 'Web Bluetooth is not supported in this browser.');
      return;
    }

    try {
      setLoading(true);
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [UART_SERVICE_UUID, 'heart_rate', 'battery_service']
      });

      log(MessageType.STATUS, `Connecting to ${device.name || 'Device'}...`);
      
      device.addEventListener('gattserverdisconnected', disconnect);
      const server = await device.gatt.connect();
      
      const services = await server.getPrimaryServices();
      let targetChar: any = null;

      // Scan for characteristics that support notifications
      for (const service of services) {
        const chars = await service.getCharacteristics();
        targetChar = chars.find((c: any) => c.properties.notify || c.properties.indicate);
        if (targetChar) break;
      }

      if (targetChar) {
        await targetChar.startNotifications();
        targetChar.addEventListener('characteristicvaluechanged', (e: any) => {
          const decoder = new TextDecoder();
          log(MessageType.RECEIVED, decoder.decode(e.target.value));
        });
      }

      setBleState({
        device,
        server,
        characteristic: targetChar,
        connected: true,
        deviceName: device.name || 'Connected Device'
      });

      log(MessageType.STATUS, 'Connection established successfully.');
    } catch (err: any) {
      log(MessageType.ERROR, err.message);
    } finally {
      setLoading(false);
    }
  };

  const send = async () => {
    if (!input.trim() || !bleState.connected) return;

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(input + '\n');
      
      // Look for write characteristic if the default one isn't writable
      let writeChar = bleState.characteristic;
      if (!writeChar?.properties.write) {
        const services = await bleState.server.getPrimaryServices();
        for (const s of services) {
          const cs = await s.getCharacteristics();
          const found = cs.find((c: any) => c.properties.write || c.properties.writeWithoutResponse);
          if (found) { writeChar = found; break; }
        }
      }

      if (writeChar) {
        await writeChar.writeValue(data);
        log(MessageType.SENT, input);
        setInput('');
      } else {
        log(MessageType.ERROR, 'No writable characteristic found.');
      }
    } catch (err: any) {
      log(MessageType.ERROR, `Send failed: ${err.message}`);
    }
  };

  const handleAiAnalyze = async () => {
    const lastReceived = [...messages].reverse().find(m => m.type === MessageType.RECEIVED);
    if (!lastReceived) return;

    setLoading(true);
    const result = await analyzeBleData(lastReceived.content);
    setAiResult(result);
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200">
      {/* Navbar */}
      <nav className="border-b border-slate-800 p-4 flex justify-between items-center bg-slate-900/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-900/40">
            <i className="fa-solid fa-satellite-dish text-white"></i>
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none">BluePulse</h1>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest">Terminal v1.0</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {bleState.connected ? (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-semibold text-green-500">{bleState.deviceName}</span>
              </div>
              <button onClick={disconnect} className="text-xs text-slate-400 hover:text-red-400 transition-colors">
                <i className="fa-solid fa-power-off"></i>
              </button>
            </div>
          ) : (
            <button 
              onClick={connect}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white rounded-lg text-sm font-semibold transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2"
            >
              {loading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-brands fa-bluetooth-b"></i>}
              Scan Device
            </button>
          )}
        </div>
      </nav>

      <main className="flex-1 flex overflow-hidden">
        {/* Terminal Window */}
        <div className="flex-1 flex flex-col min-w-0">
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-6 space-y-3 font-mono text-sm terminal-glow"
          >
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center opacity-20 select-none">
                <i className="fa-solid fa-terminal text-6xl mb-4"></i>
                <p>Waiting for data transmission...</p>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 ${m.type === MessageType.SENT ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-4 py-2 rounded-2xl ${
                  m.type === MessageType.SENT ? 'bg-blue-600 text-white rounded-tr-none' :
                  m.type === MessageType.RECEIVED ? 'bg-slate-800 text-slate-300 rounded-tl-none border border-slate-700' :
                  m.type === MessageType.ERROR ? 'bg-red-900/20 text-red-400 border border-red-900/30' :
                  'bg-slate-900 text-slate-500 text-xs text-center mx-auto'
                }`}>
                  <div className="flex items-center justify-between gap-4 mb-1 text-[10px] opacity-50 uppercase font-bold tracking-tighter">
                    <span>{m.type}</span>
                    <span>{m.timestamp.toLocaleTimeString([], {hour12: false})}</span>
                  </div>
                  <div className="whitespace-pre-wrap break-all leading-relaxed">
                    {m.content}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Input Bar */}
          <div className="p-4 bg-slate-900/50 border-t border-slate-800">
            <div className="max-w-4xl mx-auto flex gap-2">
              <input 
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder={bleState.connected ? "Type command here..." : "Connect to a device first..."}
                disabled={!bleState.connected}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50"
              />
              <button 
                onClick={send}
                disabled={!bleState.connected || !input.trim()}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white rounded-xl transition-all shadow-lg shadow-blue-900/20"
              >
                <i className="fa-solid fa-paper-plane"></i>
              </button>
            </div>
          </div>
        </div>

        {/* AI Sidebar */}
        <aside className="w-80 border-l border-slate-800 bg-slate-900/30 hidden lg:flex flex-col p-6 overflow-y-auto">
          <div className="flex items-center gap-2 mb-6">
            <i className="fa-solid fa-microchip text-blue-500"></i>
            <h2 className="font-bold text-sm uppercase tracking-wider text-slate-400">AI Intelligence</h2>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl">
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Use Gemini AI to automatically interpret incoming Bluetooth packets and technical codes.
              </p>
              <button 
                onClick={handleAiAnalyze}
                disabled={loading || messages.filter(m => m.type === MessageType.RECEIVED).length === 0}
                className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all"
              >
                {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-wand-magic-sparkles"></i>}
                Analyze Last Data
              </button>
            </div>

            {aiResult && (
              <div className="p-4 bg-blue-600/10 border border-blue-500/20 rounded-xl animate-in zoom-in duration-300">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Gemini Analysis</span>
                  <button onClick={() => setAiResult(null)} className="text-slate-500 hover:text-white"><i className="fa-solid fa-xmark"></i></button>
                </div>
                <div className="text-sm text-slate-300 leading-relaxed italic">
                  "{aiResult}"
                </div>
              </div>
            )}

            <div className="pt-6 border-t border-slate-800">
              <div className="flex items-center gap-2 mb-4">
                <i className="fa-solid fa-chart-line text-slate-500"></i>
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Connection Info</h3>
              </div>
              <div className="space-y-3 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Buffer Size</span>
                  <span className="text-slate-300">Auto (Dynamic)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Protocol</span>
                  <span className="text-slate-300">GATT / ATT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">MTU</span>
                  <span className="text-slate-300">Negotiated</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-auto p-4 bg-yellow-500/5 border border-yellow-500/10 rounded-xl">
            <p className="text-[10px] text-yellow-500/60 leading-tight">
              <i className="fa-solid fa-shield-halved mr-1"></i>
              Web Bluetooth requires HTTPS and a user gesture (click) to start scanning.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
};

export default App;
