#!/bin/bash

# Copyright (c) 2018, Arm Limited and affiliates.
# SPDX-License-Identifier: Apache-2.0
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

bold=$(tput bold)
red=$(tput setaf 1)
green=$(tput setaf 2)
normal=$(tput sgr0)

output () {
  echo "${green}"$1"${normal}"
}

error () {
  echo "${red}"$1"${normal}"
	exit 1
}

WIGWAG_ROOT=${1:-"/wigwag"}
EDGE_CORE_PORT=${2:-9101}
IDENTITY_DIR=${3:-/userdata/edge_gw_config}
BIN_DIR="$WIGWAG_ROOT/system/bin"
BASHLIB_DIR="$WIGWAG_ROOT/system/lib/bash"
SCRIPT_DIR="$WIGWAG_ROOT/wwrelay-utils/debug_scripts"
I2C_DIR="$WIGWAG_ROOT/wwrelay-utils/I2C"
export NODE_PATH="$WIGWAG_ROOT/devicejs-core-modules/node_modules/"

getEdgeStatus() {
  tmpfile=$(mktemp)
  curl localhost:${EDGE_CORE_PORT}/status > $tmpfile
  status=$(jq -r .status $tmpfile)
  internalid=$(jq -r .['"internal-id"'] $tmpfile)
  lwm2mserveruri=$(jq -r .['"lwm2m-server-uri"'] $tmpfile)
  OU=$(jq -r .['"account-id"'] $tmpfile)
}

readEeprom() {
  deviceID=$(jq -r .deviceID ${IDENTITY_DIR}/identity.json)
}


factoryReset() {
  chmod 755 ${SCRIPT_DIR}/factory_wipe_gateway.sh
  ${SCRIPT_DIR}/factory_wipe_gateway.sh
}

resetDatabase() {
	output "Deleting gateway database"
	rm -rf /userdata/etc/devicejs/db
}

execute () {
  if [ "x$status" = "xconnected" ]; then
    output "Edge-core is connected..."
    readEeprom
    if [ ! -f ${IDENTITY_DIR}/identity.json -o  "x$internalid" != "x$deviceID"  ]; then
      output "Creating developer self-signed certificate."
      mkdir -p ${IDENTITY_DIR}
      if [ -f ${IDENTITY_DIR}/identity.json ] ; then 
        cp ${IDENTITY_DIR}/identity.json ${IDENTITY_DIR}/identity_original.json
      fi
      $SCRIPT_DIR/get_new_gw_identity/developer_gateway_identity/bin/create-dev-identity\
        -g $lwm2mserveruri\
        -p DEV0\
        -o $OU\
        --temp-cert-dir $(mktemp -d)\
        --identity-dir ${IDENTITY_DIR}\
        --internal-id $internalid
    fi
  else
    error "Edge-core is not connected yet. Its status is- $status. Exited with code $?."
  fi
}

getEdgeStatus
execute
