// A hand-rolled stand-in for the `xcode` pbxProject object, ported with the
// plugin from the EndToAI/Orca fork. Only the calls `xcode-project.js` makes are
// implemented; anything else is deliberately absent so a new call site fails
// loudly instead of silently doing nothing.
import path from "node:path";

export interface PbxEntry {
  value: string;
  comment?: string;
}

export interface PbxFileReference {
  path: string;
}

export interface PbxBuildFile {
  fileRef: string;
}

export interface PbxGroup {
  isa?: string;
  children: PbxEntry[];
  name?: string;
  path?: string;
}

export interface PbxNativeTarget {
  isa?: string;
  name: string;
  productName?: string;
  productType?: string;
  productReference?: string;
  buildConfigurationList?: string;
  buildPhases: PbxEntry[];
  buildRules?: string[];
  dependencies: string[];
}

export interface PbxProjectEntry {
  attributes: Record<string, Record<string, unknown>>;
  targets: PbxEntry[];
}

export interface PbxBuildConfiguration {
  isa?: string;
  name: string;
  buildSettings: Record<string, string>;
}

export interface PbxConfigurationList {
  buildConfigurations: PbxEntry[];
  defaultConfigurationName: string;
}

export interface PbxBuildPhase {
  files: PbxEntry[];
}

export interface PbxProductFile {
  uuid: string;
  fileRef: string;
  basename: string;
  group: string;
}

export interface PbxObjects {
  PBXNativeTarget: Record<string, PbxNativeTarget | string>;
  PBXProject: Record<string, PbxProjectEntry | string>;
  PBXGroup: Record<string, PbxGroup | string>;
  PBXBuildFile: Record<string, PbxBuildFile>;
  PBXFileReference: Record<string, PbxFileReference>;
  XCBuildConfiguration: Record<string, PbxBuildConfiguration>;
  XCConfigurationList: Record<string, PbxConfigurationList | string>;
  PBXTargetDependency?: Record<string, unknown>;
  PBXContainerItemProxy?: Record<string, unknown>;
}

export interface FakeProjectCalls {
  buildPhases: { files: string[]; type: string; comment: string; targetUuid: string }[];
  dependencies: number;
  groups: number;
  products: number;
}

export interface FakeProject {
  calls: FakeProjectCalls;
  hash: { project: { objects: PbxObjects } };
  generateUuid(): string;
  pbxNativeTargetSection(): Record<string, PbxNativeTarget | string>;
  pbxProjectSection(): Record<string, PbxProjectEntry | string>;
  pbxBuildFileSection(): Record<string, PbxBuildFile>;
  pbxFileReferenceSection(): Record<string, PbxFileReference>;
  pbxXCBuildConfigurationSection(): Record<string, PbxBuildConfiguration>;
  pbxXCConfigurationList(): Record<string, PbxConfigurationList | string>;
  getFirstTarget(): { uuid: string; pbxNativeTarget: PbxNativeTarget };
  getFirstProject(): { uuid: string; firstProject: PbxProjectEntry };
  addXCConfigurationList(
    configurations: PbxBuildConfiguration[],
    defaultName: string,
    comment: string,
  ): { uuid: string };
  addProductFile(targetName: string, options: { group: string }): PbxProductFile;
  addToPbxNativeTargetSection(target: { uuid: string; pbxNativeTarget: PbxNativeTarget }): void;
  addToPbxProjectSection(target: { uuid: string; pbxNativeTarget: PbxNativeTarget }): void;
  addTargetDependency(targetUuid: string, dependencies: string[]): void;
  addBuildPhase(
    files: string[],
    type: string,
    comment: string,
    targetUuid: string,
  ): { buildPhase: PbxBuildPhase };
  buildPhaseObject(type: string, comment: string, targetUuid: string): PbxBuildPhase | undefined;
  addToPbxBuildFileSection(file: { uuid: string; fileRef: string }): void;
  addPbxGroup(files: string[], name: string, groupPath: string): { uuid: string };
  addFile(filePath: string, groupUuid: string): { fileRef: string; basename: string };
  addToPbxGroup(file: string | { fileRef: string; basename: string }, parentUuid: string): void;
}

export const MAIN_TARGET_NAME = "ClawMuse";

function nativeTarget(objects: PbxObjects, uuid: string): PbxNativeTarget {
  return objects.PBXNativeTarget[uuid] as PbxNativeTarget;
}

export function group(objects: PbxObjects, uuid: string): PbxGroup {
  return objects.PBXGroup[uuid] as PbxGroup;
}

export function configurationList(project: FakeProject, uuid: string): PbxConfigurationList {
  return project.pbxXCConfigurationList()[uuid] as PbxConfigurationList;
}

export function createFakeProject(): FakeProject {
  let nextUuid = 0;
  const calls: FakeProjectCalls = { buildPhases: [], dependencies: 0, groups: 0, products: 0 };
  const objects: PbxObjects = {
    PBXNativeTarget: {
      MAIN: { name: MAIN_TARGET_NAME, buildPhases: [], dependencies: [] },
      MAIN_comment: MAIN_TARGET_NAME,
    },
    PBXProject: {
      PROJECT: { attributes: {}, targets: [{ value: "MAIN", comment: MAIN_TARGET_NAME }] },
      PROJECT_comment: "Project object",
    },
    PBXGroup: {
      ROOT: { isa: "PBXGroup", children: [{ value: "APP", comment: MAIN_TARGET_NAME }] },
      APP: { isa: "PBXGroup", children: [], name: MAIN_TARGET_NAME, path: MAIN_TARGET_NAME },
      ROOT_comment: "Root",
    },
    PBXBuildFile: {},
    PBXFileReference: {},
    XCBuildConfiguration: {},
    XCConfigurationList: {},
  };
  const phases = new Map<string, PbxBuildPhase>();

  const project: FakeProject = {
    calls,
    hash: { project: { objects } },
    generateUuid() {
      nextUuid += 1;
      return `UUID${nextUuid}`;
    },
    pbxNativeTargetSection: () => objects.PBXNativeTarget,
    pbxProjectSection: () => objects.PBXProject,
    pbxBuildFileSection: () => objects.PBXBuildFile,
    pbxFileReferenceSection: () => objects.PBXFileReference,
    pbxXCBuildConfigurationSection: () => objects.XCBuildConfiguration,
    pbxXCConfigurationList: () => objects.XCConfigurationList,
    getFirstTarget: () => ({ uuid: "MAIN", pbxNativeTarget: nativeTarget(objects, "MAIN") }),
    getFirstProject: () => ({
      uuid: "PROJECT",
      firstProject: objects.PBXProject.PROJECT as PbxProjectEntry,
    }),
    addXCConfigurationList(configurations, defaultName, comment) {
      const uuid = this.generateUuid();
      const buildConfigurations = configurations.map((configuration) => {
        const configurationUuid = this.generateUuid();
        objects.XCBuildConfiguration[configurationUuid] = configuration;
        return { value: configurationUuid, comment: configuration.name };
      });
      objects.XCConfigurationList[uuid] = {
        buildConfigurations,
        defaultConfigurationName: defaultName,
      };
      objects.XCConfigurationList[`${uuid}_comment`] = comment;
      return { uuid };
    },
    addProductFile(targetName, options) {
      calls.products += 1;
      return {
        uuid: this.generateUuid(),
        fileRef: this.generateUuid(),
        basename: `${targetName}.appex`,
        group: options.group,
      };
    },
    addToPbxNativeTargetSection(target) {
      objects.PBXNativeTarget[target.uuid] = target.pbxNativeTarget;
      objects.PBXNativeTarget[`${target.uuid}_comment`] = target.pbxNativeTarget.name;
    },
    addToPbxProjectSection(target) {
      (objects.PBXProject.PROJECT as PbxProjectEntry).targets.push({
        value: target.uuid,
        comment: target.pbxNativeTarget.name,
      });
    },
    addTargetDependency(targetUuid, dependencies) {
      calls.dependencies += 1;
      nativeTarget(objects, targetUuid).dependencies.push(...dependencies);
    },
    addBuildPhase(files, type, comment, targetUuid) {
      calls.buildPhases.push({ files, type, comment, targetUuid });
      const phase: PbxBuildPhase = { files: [] };
      for (const filePath of files) {
        const fileRef = this.generateUuid();
        const buildFile = this.generateUuid();
        const basename = path.posix.basename(filePath);
        objects.PBXFileReference[fileRef] = { path: filePath };
        objects.PBXBuildFile[buildFile] = { fileRef };
        phase.files.push({ value: buildFile, comment: `${basename} in Sources` });
      }
      phases.set(`${type}:${comment}:${targetUuid}`, phase);
      nativeTarget(objects, targetUuid).buildPhases.push({
        value: this.generateUuid(),
        comment,
      });
      return { buildPhase: phase };
    },
    buildPhaseObject(type, comment, targetUuid) {
      return phases.get(`${type}:${comment}:${targetUuid}`);
    },
    addToPbxBuildFileSection(file) {
      objects.PBXBuildFile[file.uuid] = { fileRef: file.fileRef };
    },
    addPbxGroup(files, name, groupPath) {
      calls.groups += 1;
      const uuid = this.generateUuid();
      const children = files.map((filePath) => {
        let entry = Object.entries(objects.PBXFileReference).find(
          ([key, reference]) => !key.endsWith("_comment") && reference.path === filePath,
        );
        if (!entry) {
          const fileRef = this.generateUuid();
          objects.PBXFileReference[fileRef] = { path: filePath };
          entry = [fileRef, objects.PBXFileReference[fileRef]];
        }
        return { value: entry[0], comment: path.posix.basename(filePath) };
      });
      objects.PBXGroup[uuid] = { children, name, path: groupPath };
      return { uuid };
    },
    addFile(filePath, groupUuid) {
      const fileRef = this.generateUuid();
      const basename = path.posix.basename(filePath);
      objects.PBXFileReference[fileRef] = { path: filePath };
      group(objects, groupUuid).children.push({ value: fileRef, comment: basename });
      return { fileRef, basename };
    },
    addToPbxGroup(file, parentUuid) {
      group(objects, parentUuid).children.push(
        typeof file === "string"
          ? { value: file }
          : { value: file.fileRef, comment: file.basename },
      );
    },
  };
  return project;
}
