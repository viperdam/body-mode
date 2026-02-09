// Speech Recognition Service for React Native
// MOCKED for Expo Go compatibility or lack of native module
// Simulates "Native Device Speech Recognition" without Cloud AI

interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
}

// Mock availability to true
export const isSpeechRecognitionAvailable = (): boolean => {
  return true;
};

let matchTimer: NodeJS.Timeout | null = null;

export const startSpeechRecognition = async (
  onResult: (result: { transcript: string; confidence: number }) => void,
  onError: (error: string) => void
): Promise<() => Promise<void>> => {
  console.log('[Speech] Native Listen started...');

  // Simulate a successful result from device sensors after 2 seconds
  matchTimer = setTimeout(() => {
    const mockPhrases = [
      "Add a large banana",
      "I ate a chicken salad",
      "Remove the last item",
      "Log 500ml of water"
    ];
    const transcript = mockPhrases[Math.floor(Math.random() * mockPhrases.length)];
    console.log('[Speech] Device Result:', transcript);
    onResult({ transcript, confidence: 0.95 });
  }, 2500);

  // Return a cleanup/stop function (Promise based to match interface)
  return async () => {
    stopSpeechRecognition();
  };
};

export const stopSpeechRecognition = async (): Promise<void> => {
  console.log('[Speech] Native Listen stopped');
  if (matchTimer) {
    clearTimeout(matchTimer);
    matchTimer = null;
  }
};
