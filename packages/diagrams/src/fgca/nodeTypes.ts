import FGCADriverNode from "./nodes/FGCAFactorNode";
import FGCAGoalNode from "./nodes/FGCAGoalNode";
import FGCAChangeNode from "./nodes/FGCAChangeNode";
import FGCAActivityNode from "./nodes/FGCAActivityNode";

export const FGCA_NODE_TYPES = {
  fgcaDriver: FGCADriverNode,
  fgcaGoal: FGCAGoalNode,
  fgcaChange: FGCAChangeNode,
  fgcaActivity: FGCAActivityNode,
} as const;