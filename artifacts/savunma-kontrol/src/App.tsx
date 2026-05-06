import { Router as WouterRouter, Switch, Route } from "wouter";
import ControlPanel from "@/pages/control-panel";

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Switch>
        <Route path="/" component={ControlPanel} />
      </Switch>
    </WouterRouter>
  );
}

export default App;
