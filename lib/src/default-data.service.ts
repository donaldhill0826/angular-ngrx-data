import { Injectable, Optional } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

import { Observable } from 'rxjs/Observable';
import { ErrorObservable } from 'rxjs/observable/ErrorObservable';
import { pipe } from 'rxjs/util/pipe';
import { catchError, delay, map, tap, timeout } from 'rxjs/operators';

import { HttpUrlGenerator } from './http-url-generator';
import {
  DataServiceError, EntityCollectionDataService,
  EntityDataServiceConfig,
  HttpMethods, QueryParams, RequestData
 } from './interfaces';

import { Update } from './ngrx-entity-models';

// Pass the observable straight through
export const noDelay = <K>(source: Observable<K>) => source;

/**
 * A basic, generic entity data service
 * suitable for persistence of most entities.
 * Assumes a common REST-y web API
 */
export class DefaultDataService<T> implements EntityCollectionDataService<T> {
  protected _name: string;
  protected entityName: string;
  protected entityUrl: string;
  protected entitiesUrl: string;
  protected getDelay: typeof noDelay;
  protected saveDelay: typeof noDelay;
  protected timeout: typeof noDelay;

  get name() { return this._name; }

  constructor(
    protected http: HttpClient,
    protected httpUrlGenerator: HttpUrlGenerator,
    config: EntityDataServiceConfig,
    entityName: string
  ) {
    this._name = `${entityName} DefaultDataService`;
    this.entityName = entityName;
    config = config || {};
    const { api = '', getDelay = 0, saveDelay = 0, timeout: to = 0 } = config;
    const root = api || 'api';
    this.entityUrl = httpUrlGenerator.entityResource(entityName, root)
    this.entitiesUrl = httpUrlGenerator.collectionResource(entityName, root)
    this.getDelay = getDelay ? delay(getDelay) : noDelay;
    this.saveDelay = saveDelay ? delay(saveDelay) : noDelay;
    this.timeout = to ? timeout(to) : noDelay;
  }

  add(entity: T): Observable<T> {
    const entityOrError = entity || new Error(`No "${this.entityName}" entity to add`);
    return this.execute('POST', this.entityUrl, entityOrError);
  }

  delete(key: number | string ): Observable<null> {
    let err: Error;
    if (key == null) {
      err = new Error(`No "${this.entityName}" key to delete`);
    }
    return this.execute('DELETE', this.entityUrl + key, err);
  }

  getAll(): Observable<T[]> {
    return this.execute('GET', this.entitiesUrl);
  }

  getById(key: number | string): Observable<T> {
    let err: Error;
    if (key == null) {
      err = new Error(`No "${this.entityName}" key to get`);
    }
    return this.execute('GET', this.entityUrl + key, err);
  }

  getWithQuery(queryParams: QueryParams | string ): Observable<T[]> {
    const qParams = typeof queryParams === 'string' ? { fromString: queryParams } : { fromObject: queryParams };
    const params = new HttpParams(qParams);
    return this.execute('GET', this.entitiesUrl, undefined, { params });
  }

  update(update: Update<T>): Observable<Update<T>> {
    const id = update && update.id;
    const updateOrError = id == null ?
      new Error(`No "${this.entityName}" update data or id`) :
      update;
    return this.execute('PUT', this.entityUrl + id, updateOrError );
  }

  protected execute(
    method: HttpMethods,
    url: string,
    data?: any, // data, error, or undefined/null
    options?: any): Observable<any> {

    const req: RequestData = { method, url, options };

    if (data instanceof Error) {
      return this.handleError(req)(data);
    }

    const tail = pipe(
      method === 'GET' ? this.getDelay : this.saveDelay,
      this.timeout,
      catchError(this.handleError(req))
      // tap(value => {
      //   console.log(value)
      // })
    );

    switch (method) {
      case 'DELETE': {
        return this.http.delete(url, options).pipe(tail);
      }
      case 'GET': {
        return this.http.get(url, options).pipe(tail);
      }
      case 'POST': {
        return this.http.post(url, data, options).pipe(tail);
      }
      case 'PUT': {
        const { id, changes } = data; // data must be Update<T>
        return this.http.put(url, changes, options)
          .pipe(
            // return the original Update<T> with merged updated data (if any).
            map(updated => ({id, changes: {...changes, ...updated}})),
            tail
          );
      }
      default: {
        const error = new Error('Unimplemented HTTP method, ' + method);
        return new ErrorObservable(error);
      }
    }
  }

  private handleError(reqData: RequestData) {
    return (err: any) => {
      const error = new DataServiceError(err, reqData);
      return new ErrorObservable(error);
    };
  }
}

/**
 * Create a basic, generic entity data service
 * suitable for persistence of most entities.
 * Assumes a common REST-y web API
 */
@Injectable()
export class DefaultDataServiceFactory {
  constructor(
    protected http: HttpClient,
    protected httpUrlGenerator: HttpUrlGenerator,
    @Optional() protected config: EntityDataServiceConfig,
  ) {
    config = config || new EntityDataServiceConfig();
  }

  create<T>(entityName: string) {
    return new DefaultDataService<T>(this.http, this.httpUrlGenerator, this.config, entityName);
  }
}
