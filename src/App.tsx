import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Settings, MessageSquare, Bot, X, Eye, 
  Link as LinkIcon, Search, ExternalLink, 
  Loader2, Hash, Upload, Sparkles, Brain, Coffee, Zap, Smile, 
  MessageCircle, Image as ImageIcon 
} from 'lucide-react';

// --- Types ---
type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
};

type LogEntry = {
  id: string;
  userMessage: string;
  botResponse: string;
  timestamp: number;
  botName: string;
};

type BotConfig = {
  name: string;
  themeColor: string;
  botIcon: string; 
  systemPrompt: string;
  knowledgeBase: string;
  provider: 'openai' | 'gemini';
  model: string; 
  apiKey: string;
  googleFormLink: string; 
};

// --- Default Configuration ---
const DEFAULT_CONFIG: BotConfig = {
  name: "HealthBot",
  themeColor: "emerald",
  botIcon: "brain",
  systemPrompt: `You are a helpful health assistant that provides tailored messages to users. Your goal is to gather information before giving advice.

  RESPONSE GUIDELINES:
  1. **Greeting:** If the user says "Hi" or "Start", welcome them and ask how they are doing today. 

  2. **Based on what they reply to the greetings, ALWAYS end this specific message with: {Flu Info | Mental Health | General Advice}
  
  2. **Drill Down:** If the user picks a topic (e.g., "Flu Info"), give a brief summary. Then, ask if they want Prevention tips or Symptoms. End that message with: {Prevention Tips | Symptoms | Vaccine Locations}
  
  3. **Open-Ended:** If the user asks a specific question like "Why does my head hurt?", just answer normally with text. DO NOT use curly braces/buttons for complex questions.
  
  4. **Ending:** If the conversation seems over, ask if they need anything else. End with: {No, I'm good | Ask another question}
  
  FORMATTING RULE:
  Only use the {Option A | Option B} format when you want the user to click a button. Otherwise, just speak plain text.`,
  knowledgeBase: "You will only provide responses based on the user's health concerns and the provided knowledge base.",
  provider: 'gemini', 
  model: 'gemini-2.5-flash', 
  // SECURE FIX: This reads the key from your local .env file.
  // When you run 'npm run deploy', it bakes the key into the website without showing it in the source code.
  // NOTE: Uncomment the line below when running locally in Vite!
  // IMPORTANT: LOCALLY, UNCOMMENT THE LINE BELOW TO READ FROM .ENV
  apiKey: import.meta.env.VITE_API_KEY || "", 
  googleFormLink: "https://docs.google.com/forms/d/e/1FAIpQLSdZePJdg8y8lxpiOctjuYycFUX3Iz_Ge1spdjIsgVCJZnx_gA/viewform?usp=pp_url&entry.50030800=user&entry.2131352910=bot&entry.132734065=ID" 
};

// --- Helper Components ---
const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, icon: Icon, title }: any) => {
  const baseStyle = "flex items-center justify-center px-4 py-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: any = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white shadow-md",
    secondary: "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200",
    ghost: "bg-transparent hover:bg-gray-100 text-gray-600",
    warning: "bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-200",
    success: "bg-green-100 hover:bg-green-200 text-green-800 border border-green-200"
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${baseStyle} ${variants[variant]} ${className}`} title={title}>
      {Icon && <Icon size={18} className={children ? "mr-2" : ""} />}
      {children}
    </button>
  );
};

// Icon Renderer Component
const BotAvatar = ({ icon, className }: { icon: string, className?: string }) => {
  if (icon.startsWith('http') || icon.startsWith('data:')) {
    return <img src={icon} alt="Bot" className={`object-cover rounded-full ${className}`} />;
  }

  const icons: any = {
    bot: <Bot className={className} />,
    brain: <Brain className={className} />,
    sparkles: <Sparkles className={className} />,
    coffee: <Coffee className={className} />,
    zap: <Zap className={className} />,
    smile: <Smile className={className} />,
    message: <MessageCircle className={className} />,
    avocado: <div className={`${className} flex items-center justify-center text-lg leading-none`}>🥑</div>
  };

  return icons[icon] || <Bot className={className} />;
};

// --- Helper: Parse Options from Message ---
const parseBotMessage = (content: string) => {
  const optionRegex = /\{([^{}]+)\}$/; 
  const match = content.match(optionRegex);
  
  if (match) {
    const optionsStr = match[1];
    const options = optionsStr.split('|').map(o => o.trim());
    const cleanContent = content.replace(optionRegex, '').trim();
    return { cleanContent, options };
  }
  return { cleanContent: content, options: [] };
};

// --- Main Application ---
export default function ChatbotBuilder() {
  const [config, setConfig] = useState<BotConfig>(DEFAULT_CONFIG);
  const [messages, setMessages] = useState<Message[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'logs'>('config');
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 
  const [sheetStatus, setSheetStatus] = useState<{msg: string, type: 'success' | 'error' | 'loading'} | null>(null);
  const [keyStatus, setKeyStatus] = useState<{msg: string, type: 'success' | 'error' | 'loading'} | null>(null);
  const [sessionId, setSessionId] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let sid = localStorage.getItem('chat_session_id');
    if (!sid) {
      sid = 'user_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('chat_session_id', sid);
    }
    setSessionId(sid);
  }, []);

  useEffect(() => {
    localStorage.setItem('bot_config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    if (config.provider === 'openai' && config.model.includes('gemini')) {
      setConfig(prev => ({ ...prev, model: 'gpt-3.5-turbo' }));
    } else if (config.provider === 'gemini' && config.model.includes('gpt')) {
      setConfig(prev => ({ ...prev, model: 'gemini-2.5-flash' })); 
    }
  }, [config.provider]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const getThemeColors = (color: string) => {
    const themes: any = {
      blue: { primary: 'bg-blue-600', secondary: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', ring: 'focus:ring-blue-500' },
      emerald: { primary: 'bg-emerald-600', secondary: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', ring: 'focus:ring-emerald-500' },
      violet: { primary: 'bg-violet-600', secondary: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200', ring: 'focus:ring-violet-500' },
      orange: { primary: 'bg-orange-600', secondary: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200', ring: 'focus:ring-orange-500' },
      slate: { primary: 'bg-slate-800', secondary: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-200', ring: 'focus:ring-slate-500' },
    };
    return themes[color] || themes.blue;
  };
  const theme = getThemeColors(config.themeColor);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setConfig(prev => ({ ...prev, knowledgeBase: text }));
    };
    reader.readAsText(file);
  };

  const checkAvailableModels = async () => {
    // FOR LOCAL DEV: Uncomment the line below to use .env
    // const envKey = import.meta.env.VITE_API_KEY;
    const envKey = ""; // Placeholder for preview environment
    const currentKey = config.apiKey || envKey;

    if (!currentKey) {
      setKeyStatus({msg: "⚠️ Paste an API Key first.", type: 'error'});
      return;
    }
    setKeyStatus({msg: "Checking API Key...", type: 'loading'});
    try {
      if (config.provider === 'gemini') {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${currentKey}`);
        const data = await response.json();
        if (data.error) {
           setKeyStatus({msg: `❌ Key Error: ${data.error.message}`, type: 'error'});
        } else if (data.models) {
           const chatModels = data.models
             .filter((m: any) => m.supportedGenerationMethods.includes("generateContent"))
             .map((m: any) => m.name.replace("models/", ""));
           setKeyStatus({msg: `✅ Success! Your key supports these models:\n${chatModels.join(", ")}`, type: 'success'});
        }
      } else {
        setKeyStatus({msg: "⚠️ Model checking is only available for Gemini in this debug mode.", type: 'error'});
      }
    } catch (e: any) {
      setKeyStatus({msg: `❌ Network Error: ${e.message}`, type: 'error'});
    }
  };

  const testSheetConnection = async () => {
     const cleanLink = config.googleFormLink.trim();
     if (!cleanLink) {
       setSheetStatus({msg: "⚠️ Paste a Google Form Link first.", type: 'error'});
       return;
     }
     setSheetStatus({msg: "Testing...", type: 'loading'});
     try {
       if (cleanLink.includes("/edit")) {
         setSheetStatus({msg: "❌ Error: Use 'Get pre-filled link', not the edit link.", type: 'error'});
         return;
       }
       const urlObj = new URL(cleanLink);
       const pathParts = urlObj.pathname.split('/');
       const formIdIndex = pathParts.indexOf('e') + 1;
       if (formIdIndex === 0 || formIdIndex >= pathParts.length) {
         setSheetStatus({msg: "❌ Error: Could not find Form ID in URL.", type: 'error'});
         return;
       }
       const formId = pathParts[formIdIndex];
       const submitUrl = `https://docs.google.com/forms/d/e/${formId}/formResponse`;
       const params = new URLSearchParams(urlObj.search);
       const entries = Array.from(params.keys()).filter(key => key.startsWith('entry.'));

       if (entries.length < 3) {
         setSheetStatus({msg: `⚠️ Warning: Found ${entries.length} fields. Recommended: 3 (User, Bot, SessionID).`, type: 'error'});
       }

       const formData = new FormData();
       if (entries[0]) formData.append(entries[0], "TEST_USER");
       if (entries[1]) formData.append(entries[1], "TEST_BOT");
       if (entries[2]) formData.append(entries[2], "TEST_SESSION_ID");

       await fetch(submitUrl, { method: "POST", mode: "no-cors", body: formData });
       setSheetStatus({msg: "✅ Sent! Check your Google Sheet. You should see TEST_SESSION_ID.", type: 'success'});
     } catch (e: any) {
       setSheetStatus({msg: `❌ Parsing Error: ${e.message}`, type: 'error'});
     }
  };

  const saveToGoogleSheets = async (userMsg: string, botMsg: string) => {
    const cleanLink = config.googleFormLink.trim();
    if (!cleanLink) return;
    try {
      if (!cleanLink.startsWith('http')) return;
      const urlObj = new URL(cleanLink);
      const pathParts = urlObj.pathname.split('/');
      const formIdIndex = pathParts.indexOf('e') + 1;
      if (formIdIndex === 0 || formIdIndex >= pathParts.length) return;
      const formId = pathParts[formIdIndex];
      const submitUrl = `https://docs.google.com/forms/d/e/${formId}/formResponse`;
      const params = new URLSearchParams(urlObj.search);
      const entries = Array.from(params.keys()).filter(key => key.startsWith('entry.'));
      if (entries.length < 2) return;
      const formData = new FormData();
      formData.append(entries[0], userMsg);
      formData.append(entries[1], botMsg);
      if (entries[2]) formData.append(entries[2], sessionId);
      await fetch(submitUrl, { method: "POST", mode: "no-cors", body: formData });
      const newLog = { id: Date.now().toString(), userMessage: userMsg, botResponse: botMsg, timestamp: Date.now(), botName: config.name };
      setLogs(prev => [newLog, ...prev]);
    } catch (err) { console.error("Failed to save to sheet:", err); }
  };

  const generateResponse = async (history: Message[], userMessage: string) => {
    // PRIORITIZE .ENV KEY, FALLBACK TO CONFIG KEY
    const envKey = import.meta.env.VITE_API_KEY || "";
    
    // Fix: Use logical OR to pick the key that exists. 
    // If envKey is empty string (falsy), it picks config.apiKey.
    const finalKey = envKey || config.apiKey;

    if (!finalKey) return "⚠️ Error: Please enter a valid API Key.";
    
    const fullSystemPrompt = `${config.systemPrompt}\nCONTEXT/KNOWLEDGE BASE:\n${config.knowledgeBase}`;
    const cleanKey = finalKey.trim();

    try {
      if (config.provider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cleanKey}` },
          body: JSON.stringify({ model: config.model, messages: [{ role: "system", content: fullSystemPrompt }, ...history, { role: "user", content: userMessage }] })
        });
        const data = await response.json();
        if (data.error) return `❌ OpenAI Error: ${data.error.message}`;
        return data.choices?.[0]?.message?.content || "❌ Error: Empty response.";
      } else {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${cleanKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: fullSystemPrompt + "\nUser: " + userMessage }] }] })
        });
        const data = await response.json();
        if (data.error) return `❌ Gemini Error: ${data.error.message}`;
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "❌ Error: Empty response.";
      }
    } catch (error: any) { 
        return `❌ Network Error: ${error.message}`; 
    }
  };

  const handleSend = async (textOverride?: string) => {
    const textToSend = typeof textOverride === 'string' ? textOverride : input;
    if (!textToSend.trim()) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: textToSend, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    if (!textOverride) setInput("");
    setIsLoading(true);
    
    const historyForApi = [...messages, userMsg];

    const botResponseContent = await generateResponse(historyForApi, textToSend);
    const botMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: botResponseContent, timestamp: Date.now() };
    setMessages(prev => [...prev, botMsg]);
    setIsLoading(false);
    await saveToGoogleSheets(textToSend, botResponseContent);
  };

  return (
    <div className="flex h-screen bg-gray-50 text-slate-900 font-sans overflow-hidden">
      {!isPreviewMode && (
        <div className={`${isSidebarOpen ? 'w-full md:w-[450px] border-r' : 'w-0'} flex-shrink-0 bg-white border-gray-200 transition-all duration-300 flex flex-col z-20 absolute md:relative h-full shadow-2xl md:shadow-none overflow-hidden`}>
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
             <div className="flex gap-4">
                <button onClick={() => setActiveTab('config')} className={`pb-2 text-sm font-semibold border-b-2 ${activeTab === 'config' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>Config</button>
                <button onClick={() => setActiveTab('logs')} className={`pb-2 text-sm font-semibold border-b-2 ${activeTab === 'logs' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>Live Logs</button>
             </div>
             <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-gray-400"><X size={20}/></button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {activeTab === 'config' && (
              <div className="space-y-6 animate-fadeIn">
                
                <section className="bg-red-50 p-4 rounded-xl border-2 border-red-100">
                   <div className="flex justify-between items-start">
                     <h3 className="text-xs font-bold text-red-500 uppercase tracking-wider mb-2">Step 1: Paste Form Link</h3>
                     {config.googleFormLink && !sheetStatus && <span className="text-[10px] text-green-600 font-bold bg-green-100 px-2 py-0.5 rounded-full">Saved</span>}
                   </div>
                   <div className="relative">
                      <LinkIcon size={14} className="absolute left-3 top-3 text-red-400"/>
                      <input type="text" value={config.googleFormLink} onChange={(e) => setConfig({...config, googleFormLink: e.target.value})} className="w-full p-2 pl-9 border-2 border-red-300 rounded-lg text-xs font-mono text-gray-700 outline-none" placeholder="Paste pre-filled link here..." />
                   </div>
                   <div className="mt-2 text-right">
                     <Button variant={sheetStatus?.type === 'loading' ? 'secondary' : 'success'} onClick={testSheetConnection} className="text-xs py-1 px-3 w-full" icon={sheetStatus?.type === 'loading' ? Loader2 : ExternalLink} disabled={sheetStatus?.type === 'loading'}>
                       {sheetStatus?.type === 'loading' ? 'Testing...' : 'Test Sheet Connection'}
                     </Button>
                   </div>
                   {sheetStatus && (
                     <div className={`mt-3 p-2 rounded-lg text-[10px] font-mono whitespace-pre-wrap border ${sheetStatus.type === 'error' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-green-100 text-green-800 border-green-200'}`}>
                       {sheetStatus.msg}
                       <button onClick={() => setSheetStatus(null)} className="block mt-1 underline opacity-70 hover:opacity-100">Dismiss</button>
                     </div>
                   )}
                </section>

                <hr className="border-gray-100" />

                <section className="space-y-4">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Identity & Icon</h3>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Bot Name</label>
                    <input type="text" value={config.name} onChange={(e) => setConfig({...config, name: e.target.value})} className="w-full p-2 border border-gray-300 rounded-lg outline-none" />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Bot Avatar</label>
                    <div className="flex flex-wrap gap-2">
                      {['bot', 'brain', 'sparkles', 'coffee', 'zap', 'smile', 'message', 'avocado'].map(iconName => (
                        <button 
                          key={iconName} 
                          onClick={() => setConfig({...config, botIcon: iconName})}
                          className={`p-2 rounded-lg border-2 transition-all ${config.botIcon === iconName ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 hover:border-gray-300 text-gray-500'}`}
                        >
                          <BotAvatar icon={iconName} className="w-5 h-5" />
                        </button>
                      ))}
                    </div>
                    
                    <div className="relative mt-2">
                       <ImageIcon size={14} className="absolute left-3 top-3 text-gray-400"/>
                       <input 
                         type="text" 
                         placeholder="Or paste image URL (https://...)" 
                         value={config.botIcon.startsWith('http') ? config.botIcon : ''}
                         onChange={(e) => setConfig({...config, botIcon: e.target.value})}
                         className="w-full p-2 pl-9 border border-gray-300 rounded-lg text-xs font-mono" 
                       />
                    </div>
                  </div>
                </section>

                <hr className="border-gray-100" />

                <section className="space-y-4">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Brain & Knowledge</h3>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">System Prompt</label>
                    <textarea value={config.systemPrompt} onChange={(e) => setConfig({...config, systemPrompt: e.target.value})} className="w-full p-3 h-24 border border-gray-300 rounded-lg text-sm resize-none" />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-medium text-gray-700">Knowledge Base</label>
                      <div className="relative">
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".txt,.md,.csv,.json" />
                        <button onClick={() => fileInputRef.current?.click()} className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium bg-blue-50 px-2 py-1 rounded border border-blue-100 transition-colors">
                          <Upload size={12} /> Upload File (txt/md/csv)
                        </button>
                      </div>
                    </div>
                    <textarea value={config.knowledgeBase} onChange={(e) => setConfig({...config, knowledgeBase: e.target.value})} className="w-full p-3 h-40 border border-gray-300 rounded-lg text-sm" placeholder="Paste data here OR upload a file..." />
                    <p className="text-[10px] text-gray-400 text-right">{config.knowledgeBase.length} characters</p>
                  </div>
                </section>

                <section className="space-y-4">
                   <div className="flex justify-between items-center">
                     <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Step 2: API Key</h3>
                     {config.apiKey && !keyStatus && <span className="text-[10px] text-green-600 font-bold bg-green-100 px-2 py-0.5 rounded-full">Saved</span>}
                   </div>
                   <div className="space-y-3">
                     <div className="flex gap-2">
                        {['gemini', 'openai'].map(p => (
                          <button key={p} onClick={() => setConfig({...config, provider: p as any})} className={`flex-1 py-1.5 text-xs font-medium border rounded uppercase ${config.provider === p ? 'bg-gray-800 text-white' : 'bg-white text-gray-600'}`}>{p}</button>
                        ))}
                     </div>
                     
                     <div className="space-y-1">
                        <label className="text-[10px] text-gray-500 font-semibold uppercase">Model Version</label>
                        <select value={config.model} onChange={(e) => setConfig({...config, model: e.target.value})} className="w-full p-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-500">
                          {config.provider === 'openai' ? (
                            <>
                              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                              <option value="gpt-4">GPT-4</option>
                            </>
                          ) : (
                            <>
                              <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fastest/New)</option>
                              <option value="gemini-2.5-pro">Gemini 2.5 Pro (Best Quality)</option>
                              <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                              <option value="gemini-3-pro-preview">Gemini 3.0 Pro (Preview)</option>
                              <option value="gemini-2.0-pro-exp">Gemini 2.0 Pro (Experimental)</option>
                              <option value="gemini-1.5-flash">Gemini 1.5 Flash (Legacy)</option>
                            </>
                          )}
                        </select>
                     </div>

                     <div className="flex gap-2">
                       <input type="password" value={config.apiKey} onChange={(e) => setConfig({...config, apiKey: e.target.value})} className="flex-1 p-2 border border-gray-300 rounded-lg text-sm" placeholder="Paste API Key..." />
                       {config.provider === 'gemini' && (
                         <Button variant="warning" onClick={checkAvailableModels} title="Check which models work with your key" className="px-3">
                           <Search size={16} />
                         </Button>
                       )}
                     </div>

                     {keyStatus && (
                       <div className={`p-3 rounded-lg text-[10px] font-mono whitespace-pre-wrap border max-h-32 overflow-y-auto ${keyStatus.type === 'error' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-green-100 text-green-800 border-green-200'}`}>
                         {keyStatus.msg}
                         <button onClick={() => setKeyStatus(null)} className="block mt-2 underline opacity-70 hover:opacity-100">Dismiss</button>
                       </div>
                     )}

                   </div>
                </section>
              </div>
            )}
            
            {activeTab === 'logs' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Session Logs</h3>
                  <div className="flex items-center gap-2">
                     <span className="flex items-center gap-1 text-[10px] text-gray-500 bg-gray-100 px-2 py-1 rounded-md border border-gray-200" title="Your Session ID">
                       <Hash size={10} /> {sessionId.slice(0, 10)}...
                     </span>
                     <span className="text-xs bg-gray-100 px-2 py-1 rounded-full">{logs.length} entries</span>
                  </div>
                </div>
                <div className="space-y-3">
                  {logs.map((log) => (
                    <div key={log.id} className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs space-y-2">
                      <div className="font-semibold text-gray-700">User: <span className="font-normal text-gray-600">{log.userMessage}</span></div>
                      <div className="font-semibold text-blue-600">Bot: <span className="font-normal text-gray-600">{log.botResponse.slice(0, 80)}...</span></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col relative bg-gray-100">
        <div className="absolute top-4 right-4 z-20 flex gap-2">
          {!isPreviewMode ? (
            <Button variant="secondary" onClick={() => setIsPreviewMode(true)} icon={Eye} className="shadow-lg bg-white">Preview</Button>
          ) : (
            <Button variant="secondary" onClick={() => setIsPreviewMode(false)} icon={Settings} className="shadow-lg bg-white">Back</Button>
          )}
        </div>
        {!isSidebarOpen && !isPreviewMode && (
          <button onClick={() => setIsSidebarOpen(true)} className="absolute top-4 left-4 z-10 bg-white p-2 rounded-md shadow-md hover:bg-gray-50 text-gray-600 md:hidden"><Settings size={20}/></button>
        )}
        <div className={`flex-1 flex flex-col ${isPreviewMode ? 'max-w-3xl mx-auto w-full border-x border-gray-200 shadow-2xl my-0 md:my-8 rounded-none md:rounded-xl overflow-hidden' : 'w-full'}`}>
          <div className={`h-16 flex items-center justify-between px-6 bg-white border-b border-gray-200`}>
            <div className="flex items-center gap-3">
              {/* --- DYNAMIC AVATAR --- */}
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm overflow-hidden ${theme.primary}`}>
                <BotAvatar icon={config.botIcon} className="w-6 h-6" />
              </div>
              <div><h1 className="font-bold text-slate-800">{config.name}</h1><span className="flex items-center gap-1 text-xs text-green-600 font-medium"><span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>Online</span></div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 bg-white">
            
            {/* --- CONVERSATION STARTERS (When Empty) --- */}
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <MessageSquare size={48} className="mb-4 text-gray-300 opacity-60" />
                <p className="text-lg font-medium opacity-60">Hello! I am {config.name}.</p>
                <p className="text-sm opacity-50 mb-8">How can I help you today?</p>
                
                <div className="flex flex-wrap justify-center gap-2 max-w-md">
                  <button 
                    onClick={() => handleSend("Hi, how are you?")}
                    className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-slate-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-all shadow-sm"
                  >
                    Hi, how are you? 👋
                  </button>
                </div>
              </div>
            )}

            {/* --- MESSAGE LIST --- */}
            {messages.map((msg) => {
              // Parse options if it's a bot message
              const { cleanContent, options } = msg.role === 'assistant' 
                ? parseBotMessage(msg.content) 
                : { cleanContent: msg.content, options: [] };

              return (
                <div key={msg.id} className={`flex flex-col w-full ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                      <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white mr-2 overflow-hidden ${theme.primary}`}>
                        <BotAvatar icon={config.botIcon} className="w-5 h-5" />
                      </div>
                    )}
                    <div className={`max-w-[85%] md:max-w-[70%] p-4 rounded-2xl shadow-sm text-sm md:text-base leading-relaxed ${msg.role === 'user' ? 'bg-gray-800 text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'}`}>
                      {cleanContent}
                    </div>
                  </div>

                  {/* --- RENDER MULTIPLE CHOICE BUTTONS --- */}
                  {options.length > 0 && (
                    <div className="mt-2 ml-10 flex flex-wrap gap-2">
                      {options.map((option, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSend(option)}
                          className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-200 hover:bg-blue-100 transition-colors"
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {isLoading && <div className="flex justify-start w-full"><div className="bg-gray-100 p-4 rounded-2xl rounded-bl-none flex items-center gap-2">Loading...</div></div>}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-4 bg-white border-t border-gray-200">
            <div className="relative flex items-center gap-2">
              <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSend()} placeholder="Type a message..." className={`flex-1 p-4 pr-12 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:bg-white transition-all ${theme.ring}`} disabled={isLoading} />
              <button onClick={() => handleSend()} disabled={isLoading || !input.trim()} className={`absolute right-2 p-2 rounded-lg transition-all ${input.trim() ? `${theme.text} hover:bg-gray-100` : 'text-gray-300'}`}><Send size={20} /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

