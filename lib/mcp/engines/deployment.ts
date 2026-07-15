import { getEnv } from "../../utils/env";

export class PythonEngineManager {
    private static lastCheck: number = 0;
    private static lastResult: any = null;

    static async evaluate() {
        const now = Date.now();
        if (this.lastResult && (now - this.lastCheck < 10000)) { // 10 seconds cache
            return this.lastResult;
        }

        try {
            const defaultPyPort = process.env.PYTHON_PORT || '8181';
            const url = getEnv("PYTHON_ENGINE_URL") || `http://127.0.0.1:${defaultPyPort}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(`${url}/health`, { signal: controller.signal });
            clearTimeout(timeout);
            
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                const result = { status: 'active', message: 'Python service running', details: data };
                this.lastCheck = now;
                this.lastResult = result;
                return result;
            }
            const errResult = { status: 'offline', message: `Python service responded with error: ${res.status}` };
            this.lastCheck = now;
            this.lastResult = errResult;
            return errResult;
        } catch (e: any) {
            const errResult = { status: 'offline', message: `Python service unreachable: ${e.message}` };
            this.lastCheck = now;
            this.lastResult = errResult;
            return errResult;
        }
    }
}
