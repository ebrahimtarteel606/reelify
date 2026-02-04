/**
 * Audio utility functions for the Reelify app
 */

/**
 * Play a congratulation/success sound using Web Audio API
 * Creates a pleasant ascending chime sound (2 seconds, higher pitch)
 */
export function playSuccessSound(): void {
  try {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    
    // Create a pleasant success sound with multiple tones
    const playTone = (frequency: number, startTime: number, duration: number, volume: number) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = "sine";
      
      // Smooth envelope
      gainNode.gain.setValueAtTime(0, audioContext.currentTime + startTime);
      gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + startTime + 0.03);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + startTime + duration);
      
      oscillator.start(audioContext.currentTime + startTime);
      oscillator.stop(audioContext.currentTime + startTime + duration);
    };
    
    // Play ascending chime pattern - higher octave (C6 -> E6 -> G6 -> C7)
    // Extended timing to last ~2 seconds total
    playTone(1046.50, 0, 0.4, 0.3);       // C6
    playTone(1318.51, 0.3, 0.4, 0.3);     // E6
    playTone(1567.98, 0.6, 0.4, 0.3);     // G6
    playTone(2093.00, 0.9, 0.5, 0.35);    // C7
    playTone(2637.02, 1.2, 0.8, 0.4);     // E7 (final, longer)
    
    // Clean up audio context after sound finishes
    setTimeout(() => {
      audioContext.close();
    }, 2500);
  } catch (error) {
    // Silently fail if audio is not supported or blocked
    console.log("Could not play success sound:", error);
  }
}
