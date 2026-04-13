import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Mic, Square, Loader2, RotateCcw, CheckCircle2, Volume2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DealStoryRecorderProps {
  dealId?: number;
  transcript: string;
  onTranscriptChange: (transcript: string) => void;
  disabled?: boolean;
}

export default function DealStoryRecorder({
  dealId,
  transcript,
  onTranscriptChange,
  disabled = false,
}: DealStoryRecorderProps) {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingTime(0);
      setAudioBlob(null);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to record your deal story.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  };

  const transcribeAudio = async () => {
    if (!audioBlob) return;

    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      const res = await fetch("/api/commercial/transcribe-audio", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Transcription failed");
      }

      const data = await res.json();
      onTranscriptChange(data.transcript);
      setAudioBlob(null);
      toast({ title: "Story transcribed", description: "Your recording has been converted to text. You can edit it below." });
    } catch (err: any) {
      toast({ title: "Transcription failed", description: err.message, variant: "destructive" });
    } finally {
      setIsTranscribing(false);
    }
  };

  const resetRecording = () => {
    setAudioBlob(null);
    setRecordingTime(0);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <Card className="bg-[#1a2038] border-slate-700/50" data-testid="deal-story-card">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Volume2 size={16} className="text-amber-400" />
          <CardTitle className="text-sm text-slate-300">Deal Story</CardTitle>
          {transcript && <Badge className="text-[9px] bg-emerald-500/20 text-emerald-400">Story Added</Badge>}
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Tell us the story behind this deal — what makes it special, the borrower's vision, and why it's a good opportunity. Record a voice note or type it below.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          {!isRecording && !audioBlob && (
            <Button
              type="button"
              onClick={startRecording}
              disabled={disabled || isTranscribing}
              className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 gap-2"
              data-testid="start-recording"
            >
              <Mic size={16} />
              {transcript ? "Re-record" : "Record Voice Note"}
            </Button>
          )}

          {isRecording && (
            <>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm text-red-400 font-mono" data-testid="recording-timer">{formatTime(recordingTime)}</span>
              </div>
              <Button
                type="button"
                onClick={stopRecording}
                className="bg-slate-700 hover:bg-slate-600 text-white gap-2"
                data-testid="stop-recording"
              >
                <Square size={14} />
                Stop
              </Button>
            </>
          )}

          {audioBlob && !isTranscribing && (
            <>
              <Badge className="text-xs bg-slate-700/50 text-slate-300">
                {formatTime(recordingTime)} recorded
              </Badge>
              <Button
                type="button"
                onClick={transcribeAudio}
                className="bg-blue-600 hover:bg-blue-700 gap-2"
                data-testid="transcribe-button"
              >
                <CheckCircle2 size={14} />
                Transcribe
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={resetRecording}
                className="text-slate-400 hover:text-white gap-1"
                data-testid="reset-recording"
              >
                <RotateCcw size={14} />
                Discard
              </Button>
            </>
          )}

          {isTranscribing && (
            <div className="flex items-center gap-2 text-blue-400">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Transcribing your story...</span>
            </div>
          )}
        </div>

        <Textarea
          value={transcript}
          onChange={(e) => onTranscriptChange(e.target.value)}
          placeholder="Type your deal story here, or use the record button above to dictate it..."
          className="bg-[#0f1629] border-slate-700 text-white text-sm min-h-[100px]"
          disabled={isTranscribing || disabled}
          data-testid="story-transcript"
        />
      </CardContent>
    </Card>
  );
}
