import FGCAFactorNode from "./nodes/FGCAFactorNode";
import FGCAGoalNode from "./nodes/FGCAGoalNode";
import FGCAChangeNode from "./nodes/FGCAChangeNode";
import FGCAActivityNode from "./nodes/FGCAActivityNode";

export const FGCA_NODE_TYPES = {
  fgcaFactor: FGCAFactorNode,
  fgcaGoal: FGCAGoalNode,
  fgcaChange: FGCAChangeNode,
  fgcaActivity: FGCAActivityNode,
} as const;
