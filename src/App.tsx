import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";

function App() {
	const noiseDotRef = useRef<HTMLDivElement | null>(null);
	const isRecording = useRef(false);
	const [recordings, setRecordings] = useState<{ url: string; noiseScore: number }[]>([]);

	function convertToPercentage(value: number) {
		const oldMax = 255;
		const oldMin = 0;
		const newMax = 100;
		const newMin = 0;
		const oldRange = oldMax - oldMin;
		const newRange = newMax - newMin;
		const newValue = ((value - oldMin) * newRange) / oldRange + newMin;
		return Math.min(Math.max(newValue, newMin), newMax);
	}

	const getNoiseScore = useCallback((noiseRates: number[]) => {
		const averages = [];
		for (let i = 0; i < noiseRates.length; i += 5) {
			const set = noiseRates.slice(i, i + 5);
			const sum = set.reduce((acc, num) => acc + num, 0);
			const average = set.length > 0 ? sum / set.length : 0;
			averages.push(average);
		}
		return convertToPercentage(Math.max(...averages));
	}, []);
	const updateStatus = () => {
		if (noiseDotRef.current) {
			if (isRecording.current) {
				noiseDotRef.current.style.backgroundColor = "red";
				noiseDotRef.current.style.outline = "2px solid red";
				noiseDotRef.current.style.outlineOffset = "8px";
			} else {
				noiseDotRef.current.style.backgroundColor = "green";
				noiseDotRef.current.style.outline = "none";
			}
		}
	};

	useEffect(() => {
		let audioCtx: AudioContext;
		let analyzer: AnalyserNode;
		navigator.mediaDevices
			.getUserMedia({ audio: true })
			.then((stream) => {
				const recorder = new MediaRecorder(stream);
				audioCtx = new AudioContext({ sampleRate: 48000 });
				const source = audioCtx.createMediaStreamSource(stream);
				analyzer = audioCtx.createAnalyser();
				analyzer.fftSize = 512;
				analyzer.minDecibels = -45;
				source.connect(analyzer);
				const frequencyData = new Uint8Array(analyzer.frequencyBinCount);
				let lastNoiseAt = Date.now();
				let recordingStartedAt = 0;
				let noiseRates: number[] = [];
				let chunks: Blob[] = [];
				let isEligibleForSaving = false;
				recorder.ondataavailable = (e: BlobEvent) => {
					console.log("Saving Data");
					chunks.push(e.data);
				};
				recorder.onstop = () => {
					console.log("Stopped Recording");
					if (chunks.length > 0 && isEligibleForSaving) {
						const blob = new Blob(chunks, { type: recorder.mimeType });
						const audioURL = window.URL.createObjectURL(blob);
						const noiseScore = getNoiseScore(noiseRates);
						setRecordings((prev) => [...prev, { url: audioURL, noiseScore: noiseScore }]);
					}
					isEligibleForSaving = false;
					noiseRates = [];
					chunks = [];
				};
				recorder.onstart = () => {
					console.log("Started Recording");
				};
				const startRecording = () => {
					if (recorder.state !== "recording") {
						chunks = [];
						recorder.start();
					}
				};
				const stopRecording = () => {
					if (recorder) {
						recorder.stop();
						chunks = [];
					}
				};
				const saveAndStopRecording = () => {
					if (recorder) {
						recorder.stop();
					}
				};
				const monitorNoise = () => {
					const currentTimeStamp = Date.now();
					analyzer.getByteFrequencyData(frequencyData);
					const maxDecibels = Math.max(...frequencyData);
					if (maxDecibels > 0) {
						lastNoiseAt = currentTimeStamp;
						console.log(maxDecibels);
						if (!isRecording.current) {
							isRecording.current = true;
							startRecording();
							updateStatus();
							recordingStartedAt = currentTimeStamp;
						}
						noiseRates.push(maxDecibels);
					} else {
						if (currentTimeStamp - lastNoiseAt >= 2000 && isRecording.current) {
							isRecording.current = false;
							updateStatus();
							if (currentTimeStamp - recordingStartedAt < 2700) {
								stopRecording();
								isEligibleForSaving = false;
								console.log("Discarded:", currentTimeStamp - recordingStartedAt);
							} else {
								isEligibleForSaving = true;
								saveAndStopRecording();
							}
						}
					}
					requestAnimationFrame(monitorNoise);
				};
				requestAnimationFrame(monitorNoise);
			})
			.catch((err) => {
				console.log(err);
			});
		return () => {
			if (audioCtx) {
				audioCtx.close();
			}
			if (analyzer) {
				analyzer.disconnect();
			}
		};
	}, [getNoiseScore]);
	const getColor = (value: number) => {
		const red = Math.min(255, Math.round((value / 100) * 255));
		const green = Math.min(255, Math.round(((100 - value) / 100) * 255));
		return `rgb(${red}, ${green}, 0)`;
	};
	return (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
			<h1>Noise Detector</h1>
			<div ref={noiseDotRef} style={{ width: "100px", height: "100px", borderRadius: "50%", backgroundColor: "green" }}></div>
			<h5>Recordings</h5>
			<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
				{recordings.map((recording, i) => (
					<audio controls key={i} style={{ backgroundColor: getColor(recording.noiseScore), borderRadius: "30px" }}>
						<source src={recording.url} />
					</audio>
				))}
			</div>
		</div>
	);
}

export default App;
