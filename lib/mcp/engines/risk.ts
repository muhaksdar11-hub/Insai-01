export class DailyRiskEngine {
    static evaluate(dailyLossAmount: number, maxDailyLoss: number) {
        if (dailyLossAmount >= maxDailyLoss) {
            return { status: 'breached', reason: 'Daily max loss reached' };
        }
        return { status: 'clear' };
    }
}

export class ConsecutiveLossProtection {
    static evaluate(currentLossStreak: number, maxStreak: number = 3) {
        if (currentLossStreak >= maxStreak) {
            return { status: 'breached', reason: `Consecutive loss limit (${maxStreak}) reached` };
        }
        return { status: 'clear' };
    }
}

export class CapitalPreservationEngine {
    static evaluate(accountBalance: number, initialBalance: number) {
        const drawdown = (initialBalance - accountBalance) / initialBalance;
        if (drawdown > 0.05) {
            return { status: 'active', mode: 'preservation', suggestion: 'Halve position size' };
        }
        return { status: 'clear' };
    }
}

export class DrawdownGuard {
    static evaluate(currentDrawdownPercent: number, maxDrawdownPercent: number = 10) {
        if (currentDrawdownPercent >= maxDrawdownPercent) {
            return { status: 'breached', reason: `Max drawdown (${maxDrawdownPercent}%) reached` };
        }
        return { status: 'clear' };
    }
}
