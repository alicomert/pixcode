import React, { useState } from 'react';
import { ExecutionEvent } from './useExecutionState';
import { ChevronDown, ChevronRight, Brain, Terminal, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface TimelineItemProps {
  event: ExecutionEvent;
  isLast: boolean;
}

const TimelineItem: React.FC<TimelineItemProps> = ({ event, isLast }) => {
  const [isCollapsed, setIsCollapsed] = useState(true);

  if (event.kind === 'thought') {
    return (
      <div className="flex gap-4 pb-4">
        <div className="flex flex-col items-center">
          <div className="z-10 flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/10 text-blue-400 ring-8 ring-slate-900">
            <Brain size={16} />
          </div>
          {!isLast && <div className="w-px h-full bg-slate-800 my-1" />}
        </div>
        <div className="flex-1 pt-1">
          <p className="text-sm text-slate-400 italic font-medium">Thought</p>
          <div className="mt-2 p-3 rounded-lg bg-slate-800/30 border border-slate-700/50 text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">
            {event.text}
          </div>
        </div>
      </div>
    );
  }

  if (event.kind === 'tool-call') {
    const isRunning = event.status === 'running';
    const isFailed = event.status === 'failed';
    const isSuccess = event.status === 'completed';

    return (
      <div className="flex gap-4 pb-4">
        <div className="flex flex-col items-center">
          <div className={\`z-10 flex items-center justify-center w-8 h-8 rounded-full ring-8 ring-slate-900 \${
            isRunning ? 'bg-amber-500/10 text-amber-400 animate-pulse' : 
            isFailed ? 'bg-red-500/10 text-red-400' : 
            'bg-emerald-500/10 text-emerald-400'
          }\`}>
            {isRunning ? <Loader2 size={16} className="animate-spin" /> : 
             isFailed ? <XCircle size={16} /> : 
             <Terminal size={16} />}
          </div>
          {!isLast && <div className="w-px h-full bg-slate-800 my-1" />}
        </div>
        <div className="flex-1 pt-1">
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-200 hover:text-white transition-colors group"
          >
            {isCollapsed ? <ChevronRight size={14} className="text-slate-500 group-hover:text-slate-300" /> : <ChevronDown size={14} className="text-slate-300" />}
            <span className="font-mono text-blue-400">call:</span>
            <span>{event.tool}</span>
            {isSuccess && <CheckCircle2 size={14} className="text-emerald-500 ml-1" />}
            {isFailed && <span className="text-xs text-red-400 font-normal ml-2">(failed)</span>}
          </button>
          {!isCollapsed && (
            <div className="mt-3 space-y-2 pl-2">
              <div className="p-3 rounded-md bg-black/40 border border-slate-800/50 font-mono text-[11px] leading-relaxed text-slate-400">
                <div className="text-slate-600 mb-1 uppercase tracking-wider font-bold text-[9px]">Arguments</div>
                {JSON.stringify(event.args, null, 2)}
              </div>
              {event.result && (
                <div className="p-3 rounded-md bg-slate-900/80 border border-slate-800 font-mono text-[11px] leading-relaxed text-slate-300">
                  <div className="text-slate-600 mb-1 uppercase tracking-wider font-bold text-[9px]">Result</div>
                  {typeof event.result === 'string' ? event.result : JSON.stringify(event.result, null, 2)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (event.kind === 'message' && event.role === 'agent') {
    return (
      <div className="flex gap-4 pb-4">
        <div className="flex flex-col items-center">
          <div className="z-10 flex items-center justify-center w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-400 ring-8 ring-slate-900">
            <CheckCircle2 size={16} />
          </div>
          {!isLast && <div className="w-px h-full bg-slate-800 my-1" />}
        </div>
        <div className="flex-1 pt-1">
          <div className="text-slate-200 text-sm prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-black/50">
            {event.parts.map((p, i) => p.kind === 'text' && <div key={i}>{p.text}</div>)}
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export const VerticalTimeline: React.FC<{ events: ExecutionEvent[] }> = ({ events }) => {
  return (
    <div className="max-w-3xl mx-auto p-8 bg-slate-950/20 rounded-xl border border-slate-800/50 backdrop-blur-sm shadow-2xl">
      <div className="relative">
        <div className="absolute left-[15px] top-4 bottom-4 w-px bg-gradient-to-b from-blue-500/20 via-slate-800 to-transparent" />
        <div className="space-y-2">
          {events.map((event, index) => (
            <TimelineItem 
              key={index} 
              event={event} 
              isLast={index === events.length - 1} 
            />
          ))}
        </div>
      </div>
    </div>
  );
};
