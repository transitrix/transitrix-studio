declare module 'bpmn-moddle' {
  export class BpmnModdle {
    constructor(options?: any);
    fromXML(xml: string, rootElement: string): Promise<{ rootElement: any; warnings: any[] }>;
  }
}
