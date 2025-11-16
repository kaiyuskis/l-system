import * as THREE from 'three';

function parseParameters(
  str: string,
  startIndex: number,
  defaultValues: number[] = []
): { values: number[]; nextIndex: number } {
  if (str[startIndex] !== '(') {
    return { values: defaultValues, nextIndex: startIndex };
  }
  
  const closingParenIndex = str.indexOf(')', startIndex);
  if (closingParenIndex === -1) {
    console.error(`Parse error: Missing ')' after index ${startIndex}`);
    return { values: defaultValues, nextIndex: startIndex };
  }

  const paramString = str.substring(startIndex + 1, closingParenIndex);
  if (paramString === '') {
    return { values: defaultValues, nextIndex: closingParenIndex + 1 };
  }

  const values = paramString.split(',').map(s => parseFloat(s.trim()));

  if (values.some(isNaN)) {
    console.error(`Parse error: Invalid number in "${paramString}"`);
    return { values: defaultValues, nextIndex: closingParenIndex + 1 };
  }

  return { values: values, nextIndex: closingParenIndex + 1 };
}

export function generateLSystemString(
  premise: string,
  rules: { [key: string]: (...args: any[]) => string },
  generations: number,
  globalParams: any
): string {
  let currentString = premise;

  for (let i = 0; i < generations; i++) {
    let nextString = '';
    let j = 0;
    
    while (j < currentString.length) {
      const char = currentString[j];
      
      if (char.match(/[A-Z]/)) {
        const { values, nextIndex } = parseParameters(currentString, j + 1, []);
        const command = char;
        const rule = rules[command];

        if (rule) {
          const replacement = rule.apply(null, [...values, globalParams]);
          nextString += replacement;
          j = nextIndex;
        } else {
          nextString += currentString.substring(j, nextIndex);
          j = nextIndex;
        }
      } else {
        const { values, nextIndex } = parseParameters(currentString, j + 1, []);
        nextString += currentString.substring(j, nextIndex);
        j = nextIndex;
      }
    }
    currentString = nextString;
  }
  return currentString;
}

export function createLSystem3D(
  lSystemString: string,
  defaultAngle: number,
  defaultLength: number,
  defaultWidth: number,
  branchColor: THREE.ColorRepresentation,
  leafInstanceList: THREE.Matrix4[]
): THREE.Group {
  const plant = new THREE.Group();
  const turtle = new THREE.Object3D();
  const stack: THREE.Object3D[] = [];
  
  const branchMaterial = new THREE.MeshStandardMaterial({
    color: branchColor
  });

  const leafDummy = new THREE.Object3D();

  let i = 0;
  while (i < lSystemString.length) {
    const char = lSystemString[i];
    
    let params: number[];
    let nextIndex: number;

    switch (char) {
      case 'F': {
        ({ values: params, nextIndex } = parseParameters(lSystemString, i + 1, [defaultLength, defaultWidth]));
        const length = params[0];
        const width = params.length > 1 ? params[1] : defaultWidth;
        i = nextIndex;

        const branchGeometry = new THREE.CylinderGeometry(width, width, length, 8);
        const branchMesh = new THREE.Mesh(branchGeometry, branchMaterial);
        branchMesh.position.set(0, length / 2, 0);
        branchMesh.castShadow = true;
        branchMesh.receiveShadow = true;
        
        const container = new THREE.Object3D();
        container.add(branchMesh);
        container.position.copy(turtle.position);
        container.quaternion.copy(turtle.quaternion);
        
        plant.add(container);
        turtle.translateY(length);
        break;
      }
      case 'L': {
        ({ values: params, nextIndex } = parseParameters(lSystemString, i + 1, [1.0]));
        const scale = params[0];
        i = nextIndex;

        leafDummy.position.copy(turtle.position);
        leafDummy.quaternion.copy(turtle.quaternion);
        leafDummy.scale.set(scale, scale, scale);
        
        leafDummy.translateY(scale * 0.5); // (leafSize / 2)
        
        leafDummy.updateMatrix();
        leafInstanceList.push(leafDummy.matrix.clone());
        break;
      }
      case 'f': {
        ({ values: params, nextIndex } = parseParameters(lSystemString, i + 1, [defaultLength]));
        i = nextIndex;
        turtle.translateY(params[0]);
        break;
      }
      case '+': {
        ({ values: params, nextIndex } = parseParameters(lSystemString, i + 1, [defaultAngle]));
        i = nextIndex;
        turtle.rotateX(THREE.MathUtils.degToRad(params[0]));
        break;
      }
      case '-': {
        ({ values: params, nextIndex } = parseParameters(lSystemString, i + 1, [defaultAngle]));
        i = nextIndex;
        turtle.rotateX(THREE.MathUtils.degToRad(-params[0]));
        break;
      }
      case '\\': {
        ({ values: params, nextIndex } = parseParameters(lSystemString, i + 1, [defaultAngle]));
        i = nextIndex;
        turtle.rotateZ(THREE.MathUtils.degToRad(params[0]));
        break;
      }
      case '/': {
        ({ values: params, nextIndex } = parseParameters(lSystemString, i + 1, [defaultAngle]));
        i = nextIndex;
        turtle.rotateZ(THREE.MathUtils.degToRad(-params[0]));
        break;
      }
      case '&': {
        ({ values: params, nextIndex } = parseParameters(lSystemString, i + 1, [defaultAngle]));
        i = nextIndex;
        turtle.rotateY(THREE.MathUtils.degToRad(params[0]));
        break;
      }
      case '^': {
        ({ values: params, nextIndex } = parseParameters(lSystemString, i + 1, [defaultAngle]));
        i = nextIndex;
        turtle.rotateY(THREE.MathUtils.degToRad(-params[0]));
        break;
      }
      case '[':
        stack.push(turtle.clone());
        i++;
        break;
      case ']': {
        const poppedState = stack.pop();
        if (poppedState) {
          turtle.copy(poppedState);
        }
        i++;
        break;
      }
      default:
        i++;
        break;
    }
  }
  return plant;
}