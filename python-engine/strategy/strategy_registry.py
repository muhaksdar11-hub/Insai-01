import importlib
import pkgutil
import inspect
from typing import Dict, List
from strategy.base_strategy import BaseStrategy

class StrategyRegistry:
    def __init__(self):
        self._strategies: Dict[str, BaseStrategy] = {}
        # Auto register on initialization
        self.auto_register()

    def register(self, strategy: BaseStrategy):
        self._strategies[strategy.metadata.id] = strategy

    def auto_register(self, package_names: List[str] = None):
        if package_names is None:
            package_names = ["strategy.modules", "strategies"]
            
        for package_name in package_names:
            try:
                package = importlib.import_module(package_name)
            except ModuleNotFoundError:
                continue
                
            for _, module_name, _ in pkgutil.iter_modules(package.__path__):
                full_module_name = f"{package_name}.{module_name}"
                try:
                    module = importlib.import_module(full_module_name)
                    for name, obj in inspect.getmembers(module, inspect.isclass):
                        # Check if it's a subclass of BaseStrategy and not BaseStrategy itself
                        if issubclass(obj, BaseStrategy) and obj is not BaseStrategy:
                            strategy_instance = obj()
                            self.register(strategy_instance)
                except Exception as e:
                    import logging
                    logging.getLogger("insai_python_engine").error(f"Failed to load strategy {full_module_name}: {e}")

    def get_strategy(self, strategy_id: str) -> BaseStrategy:
        return self._strategies.get(strategy_id)

    def get_sorted_strategies(self) -> List[BaseStrategy]:
        return sorted(self._strategies.values(), key=lambda s: s.metadata.priority, reverse=True)

registry = StrategyRegistry()
