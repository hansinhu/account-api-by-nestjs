/**
 * @file index.ts
 * @Synopsis 通用注解器
 *
 * @author 徐敏辉
 * @date 2019-07-31
 */
import uuid from 'uuid/v4'
import { PipeTransform } from '@nestjs/common'
import { Type } from '@nestjs/common/interfaces'
import { isFunction, isNil } from '@nestjs/common/utils/shared.utils'
import { ROUTE_ARGS_METADATA, CUSTOM_ROUTE_AGRS_METADATA } from '@nestjs/common/constants'
import { ParamData, RouteParamMetadata } from '@nestjs/common'

declare type CustomParamFactory<
  // 0: 构造函数, 1: 传参
	TData = [Function, any],
	TRequest = any,
	TResult = any>
= (data: TData, req: TRequest) => TResult;

const assignCustomMetadata = (
  args: RouteParamMetadata,
  paramtype: number | string,
  index: number,
  factory: CustomParamFactory,
  data?: ParamData,
  ...pipes: (Type<PipeTransform> | PipeTransform)[]
) => ({
  ...args,
  [`${paramtype}${CUSTOM_ROUTE_AGRS_METADATA}:${index}`]: {
    index,
    factory,
    data,
    pipes,
  },
})

export function createParamDecorator(
  factory: CustomParamFactory,
  enhancers: ParameterDecorator[] = [],
): (
  ...dataOrPipes: (Type<PipeTransform> | PipeTransform | any)[]
) => ParameterDecorator {
  const paramtype = uuid()
  return (
    data?,
    ...pipes: (Type<PipeTransform> | PipeTransform)[]
  ): ParameterDecorator => (target, key, index) => {
    const args =
      Reflect.getMetadata(ROUTE_ARGS_METADATA, target.constructor, key) || {}

    const isPipe = (pipe: any) =>
      pipe &&
      ((isFunction(pipe) && pipe.prototype && isFunction(pipe.prototype.transform)) ||
        isFunction(pipe.transform))

    const hasParamData = isNil(data) || !isPipe(data)
    const paramData = hasParamData ? data : undefined
    const paramPipes = hasParamData ? pipes : [data, ...pipes]

    Reflect.defineMetadata(
      ROUTE_ARGS_METADATA,
      assignCustomMetadata(
        args,
        paramtype,
        index,
        factory,
        [target.constructor, paramData],
        ...(paramPipes as PipeTransform[]),
      ),
      target.constructor,
      key,
    )
    enhancers.forEach(fn => fn(target, key, index))
  }
}
