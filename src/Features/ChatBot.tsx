import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Mic, MicOff, Loader2, BrainCircuit,Send } from 'lucide-react';
import styles from './ChatBot.module.css';
import Albert_idle from '../assets/Albert_idle.mp4';
import Albert_talking from '../assets/Albert_talking.mp4';


const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

const Chatbot: React.FC = () => {
    const [userText, setUserText] = useState<string | null>(null);
    const [inputText, setInputText] = useState("");
    const [status, setStatus] = useState<string>("Cargando IA Neuronal...");
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [iaReady, setIaReady] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const isBusy = !iaReady || isProcessing || isSpeaking;

    const recognitionRef = useRef<any>(null);
    const workerRef = useRef<Worker | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const bubbleTimeoutRef = useRef<number | null>(null);
    
    const idleVideoRef = useRef<HTMLVideoElement>(null);
    const talkingVideoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        workerRef.current = new Worker(new URL('./ttsWorker.js', import.meta.url), { type: 'module' });
        
        workerRef.current.onmessage = (e) => {
            const { status, audio, sampling_rate, error } = e.data;

            if (status === 'ready') {
                setStatus("Sistema Online");
                setIaReady(true);
            } else if (status === 'audio_ready') {
                setIsProcessing(false);
                playRawAudio(audio, sampling_rate);
            } else if (status === 'error') {
                console.error("Error del Worker:", error);
                setStatus("Error en IA de Voz");
                setIsProcessing(false);
            }
        };

        workerRef.current.postMessage({ type: 'load' });

        idleVideoRef.current?.play().catch(() => {});
        talkingVideoRef.current?.play().catch(() => {});

        return () => workerRef.current?.terminate();
    }, []);

    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.lang = 'es-ES'; // Reconoce español
            recognitionRef.current.interimResults = false;

            recognitionRef.current.onstart = () => {
                setStatus("Escuchando...");
                setIsListening(true);
            };

            recognitionRef.current.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript;
                handleUserInteraction(transcript);
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
                if (!isSpeaking) setStatus(iaReady ? "En línea" : "Cargando...");
            };
        }
    }, [isSpeaking, iaReady]);

    const handleUserInteraction = async (text: string) => {
        if (isBusy && !isListening) return;
        setUserText(text);
        if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current);
        bubbleTimeoutRef.current = window.setTimeout(() => setUserText(null), 4000);

        setStatus("Procesando...");
        setIsProcessing(true);

        try {
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const prompt = `Eres Alberto. Responde de forma conversacional, breve y útil (máximo 40 palabras). Usuario: "${text}"`;
            
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            
            console.log("Gemini:", responseText);

            if (iaReady && workerRef.current) {
                setStatus("Sintetizando...");
                workerRef.current.postMessage({ type: 'speak', text: responseText });
            }

        } catch (error) {
            console.error(error);
            setStatus("Error de conexión");
            setIsProcessing(false);
        }
    };
    const handleTextSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputText.trim() || isBusy) return;

        handleUserInteraction(inputText);
        setInputText(""); 
    };

    const playRawAudio = (audioData: Float32Array, sampleRate: number) => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const ctx = audioContextRef.current;
        const buffer = ctx.createBuffer(1, audioData.length, sampleRate);
        buffer.getChannelData(0).set(audioData);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);

        setIsSpeaking(true);
        setStatus("Respondiendo...");
        
        source.start();
        source.onended = () => {
            setIsSpeaking(false); 
            setStatus("En línea");
        };
    };

    return (
        <div className={styles.container}>
            <div className={`${styles.avatarContainer} ${isSpeaking ? styles.speaking : ''}`}>
                {userText && <div className={styles.userBubble}>{userText}</div>}
                <div className={styles.wave}></div>
                <div className={styles.wave}></div>
                <div className={styles.wave}></div>
                <video ref={idleVideoRef} src={Albert_idle} className={`${styles.avatarVideo} ${!isSpeaking ? styles.visible : styles.hidden}`} loop muted playsInline />
                <video ref={talkingVideoRef} src={Albert_talking} className={`${styles.avatarVideo} ${isSpeaking ? styles.visible : styles.hidden}`} loop muted playsInline />
            </div>

            <div className={`${styles.statusText} ${isBusy ? styles.statusLoading : ''}`}>
                {!iaReady ? (
                    <span style={{display:'flex', gap:8, alignItems:'center'}}>
                        <Loader2 className="animate-spin"/> Inicializando Núcleo...
                    </span>
                ) : status}
            </div>

            <div className={styles.controls}>
                <form onSubmit={handleTextSubmit} className={styles.inputGroup}>
                    <input 
                        type="text" 
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder={isBusy ? "Esperando respuesta..." : "Escribe un mensaje..."}
                        className={styles.textInput}
                        disabled={isBusy} 
                    />
                    <button 
                        type="submit" 
                        className={styles.sendButton}
                        disabled={!inputText.trim() || isBusy}
                    >
                        <Send size={20}style={{scale:3}} />
                    </button>
                </form>

                <button 
                    onClick={() => !isListening && recognitionRef.current?.start()}
                    className={`${styles.micButton} ${isListening ? styles.micActive : ''}`}
                    disabled={isBusy} 
                    title="Hablar por micrófono"
                >
                    {isListening ? <MicOff size={24} /> : <Mic size={24} />}
                </button>
            </div>

            <div style={{position:'absolute', bottom:10, right:20, opacity:0.4, fontSize:11, display:'flex', gap:6, alignItems:'center', fontFamily:'monospace'}}>
                <BrainCircuit size={14} color="#00ffcc"/> 
                <span style={{color:'#00ffcc'}}>AI</span> ASSISTENT by <p className={styles.NewP} onClick={()=> window.location.href="https://github.com/ValenDD1"} >valenDD1</p>
            </div>
        </div>
    );
};

export default Chatbot;