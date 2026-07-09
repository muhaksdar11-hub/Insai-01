import { getEnv } from "../../utils/env";
export class PythonEngineManager {
    static async evaluate() {
        try {
            const defaultPyPort = process.env.PYTHON_PORT || '8181';
            const url = getEnv("PYTHON_ENGINE_URL") || `http://127.0.0.1:${defaultPyPort}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(`${url}/health`, { signal: controller.signal });
            clearTimeout(timeout);
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                return { status: 'active', message: 'Python service running', details: data };
            }
            return { status: 'offline', message: `Python service responded with error: ${res.status}` };
        } catch (e: any) {
            return { status: 'offline', message: `Python service unreachable: ${e.message}` };
        }
    }
}

