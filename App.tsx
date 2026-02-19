
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageType } from './types.ts';
import { analyzeBleData } from './services/geminiService.ts';

const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';

const App: React.FC = () => {
  const [messages, setMessages] = useState<any[]>([]);
  const [bleState, setBleState] = useState<any>({
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

  const log = useCallback((type: string, content: string) => {
    setMessages(prev => [...prev, {
      id: Math.random().toString(36),
      timestamp: new Date(),
      type,
      content
    }]);
  }, []);

  const disconnect = useCallback(() => {
    if (bleState.device?.gatt?.connected) {
      bleState.device.gatt.disconnect();
    }
    setBleState({ device: null, server: null, characteristic: null, connected: false, deviceName: '' });
    log(MessageType.STATUS, 'Perangkat terputus.');
  }, [bleState.device, log]);

  const connect = async () => {
    if (!(navigator as any).bluetooth) {
      log(MessageType.ERROR, 'Browser ini tidak mendukung Bluetooth.');
      return;
    }

    try {
      setLoading(true);
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [UART_SERVICE_UUID, 'heart_rate', 'battery_service']
      });

      log(MessageType.STATUS, `Menghubungkan ke ${device.name || 'Perangkat'}...`);
      
      device.addEventListener('gattserverdisconnected', disconnect);
      const server = await device.gatt.connect();
      const services = await server.getPrimaryServices();
      let targetChar: any = null;

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

      log(MessageType.STATUS, 'Terhubung!');
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
      let writeChar = bleState.characteristic;
      
      if (!writeChar?.properties.write && !writeChar?.properties.writeWithoutResponse) {
        const services = await bleState.server.getPrimaryServices();
        for (const s of services) {
          const cs = await s.getCharacteristics();
          writeChar = cs.find((c: any) => c.properties.write || c.properties.writeWithoutResponse);
          if (writeChar) break;
        }
      }

      if (writeChar) {
        await writeChar.writeValue(data);
        log(MessageType.SENT, input);
        setInput('');
      } else {
        log(MessageType.ERROR, 'Karakteristik penulisan tidak ditemukan.');
      }
    } catch (err: any) {
      log(MessageType.ERROR, `Gagal kirim: ${err.message}`);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200">
      <nav className="border-b border-slate-800 p-4 flex justify-between items-center bg-slate-900/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-900/40">
            <i className="fa-solid fa-satellite-dish text-white"></i>
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none">BluePulse</h1>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest">Terminal</span>
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
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
            >
              {loading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-brands fa-bluetooth-b"></i>}
              Scan
            </button>
          )}
        </div>
      </nav>

      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-3 font-mono text-sm">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center opacity-20">
                <i className="fa-solid fa-terminal text-6xl mb-4"></i>
                <p>Menunggu data...</p>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex gap-3 ${m.type === 'sent' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-4 py-2 rounded-2xl ${
                  m.type === 'sent' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'
                }`}>
                  <div className="flex items-center justify-between gap-4 mb-1 text-[10px] opacity-50 uppercase font-bold">
                    <span>{m.type}</span>
                    <span>{m.timestamp.toLocaleTimeString()}</span>
                  </div>
                  <div className="whitespace-pre-wrap break-all leading-relaxed">{m.content}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 bg-slate-900/50 border-t border-slate-800">
            <div className="max-w-4xl mx-auto flex gap-2">
              <input 
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder={bleState.connected ? "Ketik perintah..." : "Hubungkan perangkat..."}
                disabled={!bleState.connected}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
              <button onClick={send} disabled={!bleState.connected || !input.trim()} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl transition-all">
                <i className="fa-solid fa-paper-plane"></i>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
