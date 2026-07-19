// PNG/JPG 등 이미지 에셋을 TypeScript에서 import/require 할 수 있도록 하는 ambient 선언.
// RN Metro의 asset 변환 결과(require 시점 리소스 id)는 Image의 source prop과 호환된다.
declare module '*.png' {
  const value: number;
  export default value;
}

declare module '*.jpg' {
  const value: number;
  export default value;
}

declare module '*.jpeg' {
  const value: number;
  export default value;
}
