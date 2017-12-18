import { Simple } from '@glimmer/interfaces';
import { DirtyableTag, Tag, TagWrapper, VersionedPathReference } from '@glimmer/reference';
import { Option } from '@glimmer/util';
import { environment } from 'ember-environment';
import { run } from 'ember-metal';
import { assign, OWNER } from 'ember-utils';
import { Renderer } from '../renderer';
import { Container, OwnedTemplate } from '../template';
import { RouteInfo, privateRouteInfos } from 'ember-routing';

interface RouteInfoReference {
  tag: Tag;
  get(key: string): RouteInfoReference;
  value(): Option<RouteInfo>;
}

export class RootOutletStateReference implements RouteInfoReference {
  tag: Tag;

  constructor(public outletView: OutletView) {
    this.tag = outletView._tag;
  }

  get(key: string) : RouteInfoReference {
    return new ChildOutletStateReference(this, key);
  }

  value(): Option<RouteInfo> {
    return this.outletView.outletState;
  }

  getOrphan(name: string): RouteInfoReference {
    return new OrphanedOutletStateReference(this, name);
  }

  update(state: RouteInfo) {
    this.outletView.setOutletState(state);
  }
}

// So this is a relic of the past that SHOULD go away
// in 3.0. Preferably it is deprecated in the release that
// follows the Glimmer release.
class OrphanedOutletStateReference extends RootOutletStateReference {
  public root: RootOutletStateReference;
  public name: string;

  constructor(root: RootOutletStateReference, name: string) {
    super(root.outletView);
    this.root = root;
    this.name = name;
  }

  value(): Option<RouteInfo> {
    let rootState = this.root.value();
    let orphans = rootState && rootState.child && rootState.child.getChild('__ember_orphans__');

    if (!orphans) {
      return null;
    }

    let matched = orphans.getChild(this.name);

    if (!matched) {
      return null;
    }

    let privMatch = privateRouteInfos.get(matched)!;
    privMatch.wasUsed = true;

    // TODO: this used to be wrapped in another layer
    return matched;
  }
}

class ChildOutletStateReference implements RouteInfoReference {
  public parent: VersionedPathReference<any>;
  public key: string;
  public tag: Tag;

  constructor(parent: VersionedPathReference<any>, key: string) {
    this.parent = parent;
    this.key = key;
    this.tag = parent.tag;
  }

  get(key: string): RouteInfoReference {
    return new ChildOutletStateReference(this, key);
  }

  value(): Option<RouteInfo> {
    let parent = this.parent.value();
    return parent && parent.getChild(this.key);
  }
}

export interface BootEnvironment {
  hasDOM: boolean;
  isInteractive: boolean;
  options: any;
}

export default class OutletView {
  private _environment: BootEnvironment;
  public renderer: Renderer;
  public owner: Container;
  public template: OwnedTemplate;
  public outletState: Option<RouteInfo>;
  public _tag: TagWrapper<DirtyableTag>;

  static extend(injections: any) {
    return class extends OutletView {
      static create(options: any) {
        if (options) {
          return super.create(assign({}, injections, options));
        } else {
          return super.create(injections);
        }
      }
    };
  }

  static reopenClass(injections: any) {
    assign(this, injections);
  }

  static create(options: any) {
    let { _environment, renderer, template } = options;
    let owner = options[OWNER];
    return new OutletView(_environment, renderer, owner, template);
  }

  constructor(_environment: BootEnvironment, renderer: Renderer, owner: Container, template: OwnedTemplate) {
    this._environment = _environment;
    this.renderer = renderer;
    this.owner = owner;
    this.template = template;
    this.outletState = null;
    this._tag = DirtyableTag.create();
  }

  appendTo(selector: string | Simple.Element) {
    let env = this._environment || environment;
    let target;

    if (env.hasDOM) {
      target = typeof selector === 'string' ? document.querySelector(selector) : selector;
    } else {
      target = selector;
    }

    run.schedule('render', this.renderer, 'appendOutletView', this, target);
  }

  rerender() { /**/ }

  setOutletState(state: RouteInfo) {
    let routeInfo = new RouteInfo('-top-level');
    routeInfo.setChild('main', state);
    this.outletState = routeInfo;
    this._tag.inner.dirty();
  }

  toReference() {
    return new RootOutletStateReference(this);
  }

  destroy() { /**/ }
}
