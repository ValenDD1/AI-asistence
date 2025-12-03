import { pipeline, env, Tensor } from '@xenova/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

const EMBEDDINGS_URL = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin';

let synthesizer = null;
let speakerEmbeddings = null;

self.addEventListener('message', async (event) => {
    const { type, text } = event.data;

    if (type === 'load') {
        try {
            console.log("Worker: Iniciando carga de modelo y embeddings...");

            synthesizer = await pipeline('text-to-speech', 'Xenova/mms-tts-spa', {
                quantized: false 
            });

            const response = await fetch(EMBEDDINGS_URL);
            const buffer = await response.arrayBuffer();
            const data = new Float32Array(buffer);
            speakerEmbeddings = new Tensor('float32', data, [1, 512]);

            console.log("Worker: Modelo listo.");
            self.postMessage({ status: 'ready' });

        } catch (error) {
            console.error("Worker Error:", error);
            self.postMessage({ status: 'error', error: error.message });
        }

    } else if (type === 'speak' && synthesizer && speakerEmbeddings) {
        try {
            const output = await synthesizer(text, {
                speaker_embeddings: speakerEmbeddings
            });

            self.postMessage({
                status: 'audio_ready',
                audio: output.audio,
                sampling_rate: output.sampling_rate
            });

        } catch (error) {
            console.error("Worker Error al hablar:", error);
            self.postMessage({ status: 'error', error: error.message });
        }
    }
});