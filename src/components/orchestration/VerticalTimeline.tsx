import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Brain, Terminal, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

import { ExecutionEvent } from './useExecutionState';

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
          <div className="z-10 flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10 text-blue-400 ring-8 ring-slate-900">
            <Brain size={16} />
          </div>
          {!isLast && <div className="my-1 h-full w-px bg-slate-800" />}
        </div>
        <div className="flex-1 pt-1">
          <p className="text-sm font-medium italic text-slate-400">Thought</p>
          <div className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-700/50 bg-slate-800/30 p-3 text-sm leading-relaxed text-slate-300">
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
          <div className={`z-10 flex h-8 w-8 items-center justify-center rounded-full ring-8 ring-slate-900 ${
            isRunning ? 'animate-pulse bg-amber-500/10 text-amber-400' :
            isFailed ? 'bg-red-500/10 text-red-400' :
            'bg-emerald-500/10 text-emerald-400'
          }`}>
            {isRunning ? <Loader2 size={16} className="animate-spin" /> : 
             isFailed ? <XCircle size={16} /> : 
             <Terminal size={16} />}
          </div>
          {!isLast && <div className="my-1 h-full w-px bg-slate-800" />}
        </div>
        <div className="flex-1 pt-1">
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="group flex items-center gap-2 text-sm font-semibold text-slate-200 transition-colors hover:text-white"
          >
            {isCollapsed ? <ChevronRight size={14} className="text-slate-500 group-hover:text-slate-300" /> : <ChevronDown size={14} className="text-slate-300" />}
            <span className="font-mono text-blue-400">call:</span>
            <span>{event.tool}</span>
            {isSuccess && <CheckCircle2 size={14} className="ml-1 text-emerald-500" />}
            {isFailed && <span className="ml-2 text-xs font-normal text-red-400">(failed)</span>}
          </button>
          {!isCollapsed && (
            <div className="mt-3 space-y-2 pl-2">
              <div className="rounded-md border border-slate-800/50 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-slate-400">
                <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-600">Arguments</div>
                {JSON.stringify(event.args, null, 2)}
              </div>
              {event.result && (
                <div className="rounded-md border border-slate-800 bg-slate-900/80 p-3 font-mono text-[11px] leading-relaxed text-slate-300">
                  <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-600">Result</div>
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
          <div className="z-10 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-400 ring-8 ring-slate-900">
            <CheckCircle2 size={16} />
          </div>
          {!isLast && <div className="my-1 h-full w-px bg-slate-800" />}
        </div>
        <div className="flex-1 pt-1">
          <div className="prose prose-invert max-w-none text-sm text-slate-200 prose-p:leading-relaxed prose-pre:bg-black/50">
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
    <div className="mx-auto max-w-3xl rounded-xl border border-slate-800/50 bg-slate-950/20 p-8 shadow-2xl backdrop-blur-sm">
      <div className="relative">
        <div className="absolute bottom-4 left-[15px] top-4 w-px bg-gradient-to-b from-blue-500/20 via-slate-800 to-transparent" />
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
