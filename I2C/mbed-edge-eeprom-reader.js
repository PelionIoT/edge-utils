#!/usr/bin/env node
/*
 * Copyright (c) 2018, Arm Limited and affiliates.
 * SPDX-License-Identifier: Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


var WWAT24 = require('./WWrelay_at24c16.js');
reader = new WWAT24();
var DiskStorage = require("./diskstore.js");
var diskprom = null;
var mkdirp = require('mkdirp');

//r/w files
var fs = require('fs');
var exec = require('child_process').exec;
var execSync = require('child_process').execSync;
var Promise = require('es6-promise').Promise;
// var execSync = require('execSync');
var flatten = require('flat');
var jsonminify = require('jsonminify');
var path = require('path');
var handleBars = require('handlebars');
var _ = require('underscore');

var program = require('commander');

var sslPathDefault = "/wigwag/devicejs-core-modules/Runner/.ssl/";
var ssl_client_key = "client.key.pem";
var ssl_client_cert = "client.cert.pem";
var ssl_server_key = "server.key.pem";
var ssl_server_cert = "server.cert.pem";
var ssl_ca_cert = "ca.cert.pem";
var ssl_ca_int = "intermediate.cert.pem";
var ssl_ca_chain = "ca-chain.cert.pem";

var certsMountPoint = "/mnt/.boot/";
var certsSourcePoint = ".ssl";
if (fs.existsSync("/dev/mmcblk0p1")) {
    var certsMemoryBlock = "/dev/mmcblk0p1";
} else {
    var certsMemoryBlock = "/dev/mmcblk1p1";
}
var certsMemoryBlock_fixed = certsMemoryBlock;
var certsOutputDirectory = sslPathDefault;
var localDatabaseDirectory = "/userdata/etc/devicejs/db";
var relayFirmwareVersionFile = "/wigwag/etc/versions.json";
var factoryFirmwareVersionFile = "/mnt/.overlay/factory/wigwag/etc/versions.json";
var upgradeFirmwareVersionFile = "/mnt/.overlay/upgrade/wigwag/etc/versions.json";
var userFirmwareVersionFile = "/mnt/.overlay/user/slash/wigwag/etc/versions.json";

var template_conf_file = null;
var relayterm_template_conf_file = null;
var radioProfile_template_conf_file = null;
var relay_conf_json_file = null;
var relayterm_conf_json_file = null;
var rsmi_conf_json_file = null;
var devicejs_conf_file = null;
var devicedb_conf_file = null;
var templateDevicejsConf = null;
var templateDevicedbConf = null;
var sw_eeprom_file = null;
var devjsconf = null;
var relaytermConf = null;
var secConfObj = null;
var radioModuleConf = null;
var databasePort = null;

var cloudURL = null;
var overwrite_conf = false;
var POM = 'overwrite';
var softwareBasedRelay = false;

var hardware_conf = "./relay.conf";
// var relayconf_dot_sh = "/etc/wigwag/relayconf.sh"
// var hw_dot_conf = "/etc/wigwag/hardware.conf"
var eeprom_dot_json = "/etc/wigwag/eeprom.json";
var uuid_eeprom_path = "/etc/wigwag/.eeprom_";

var at24c256EepromFilePath = "/sys/bus/i2c/devices/1-0050/eeprom";

function flattenobj(obj, callback) {
    var out = flatten(obj, {
        delimiter: "_",
        safe: true
    });
    var str = "";
    Object.keys(out).forEach(function(key) {
        str += key + "=\"" + out[key] + "\"\n";
    });
    callback(str);
}

function read(ray, obj, callback) {
    var key = ray.shift();
    reader.get(key).then(function(res) {
        if (res) {
            //this will convert the storred hex to integers array
            if (key == "ethernetMAC" || key == "sixBMAC") {
                obj[key] = {
                    "string": "",
                    "array": []
                }
                newray = [];
                var newstr = "";
                var tempi = 0;
                for (var i = 0; i < res.length; i++) {
                    tempi = res.readUInt8(i);
                    temps = tempi.toString(16);
                    if (temps.length == 1) newstr += "0";
                    newray.push(tempi);
                    newstr += temps;
                };
                obj[key].string = newstr;
                obj[key].array = newray;
            } else {
                obj[key] = res.toString('ascii');
            }

            if (ray.length > 0) {
                read(ray, obj, callback);
            } else {
                callback(obj, null);
            }
        }
    }, function(err) {
        callback(null, err);
    });
}

// function createHandlebarsData(eeprom, platform) {
//     var data = {};

//     data.apikey = eeprom.serialNumber;
//     data.apisecret = eeprom.relaySecret || "17c0c7bd1c7f8a360288ef56b4230ede";  //not used by any service, just random data
//     data.cloudurl = eeprom.cloudURL;
//     // data.cloudurl_relays = eeprom.cloudURL.substring(0, eeprom.cloudURL.indexOf('.')) + '-relays' + eeprom.cloudURL.substring(eeprom.cloudURL.indexOf('.'));
//     // data.pairingCode = eeprom.pairingCode;
//     data.cloudddburl = cloudDdbURL;
//     data.clouddevicejsurl = cloudDevicejsURL;
//     data.hardwareVersion = eeprom.hardwareVersion;
//     data.radioConfig = eeprom.radioConfig;
//     data.zwavetty = eeprom.hardware.radioProfile.ZWAVE_TTY;
//     data.zigbeehatty = eeprom.hardware.radioProfile.ZIGBEEHA_TTY;
//     data.sixlbrtty = eeprom.hardware.radioProfile.SBMC_TTY.split("/")[2];
//     data.sixlbrreset = eeprom.hardware.radioProfile.SBMC_RESET;
//     data.ethernetmac = eeprom.ethernetMAC.string;

//     if(typeof eeprom.sixBMAC === 'undefined') { //Generate sixBMAC from ethernet MAC by inserting 0,1 in middle 
//     	var sixBMAC = {};
//     	eeprom.sixBMAC = JSON.parse(JSON.stringify(eeprom.ethernetMAC.array));
//     	eeprom.sixBMAC.splice(3, 0, 0);
//     	eeprom.sixBMAC.splice(4, 0, 1);
// 	    sixBMAC.string = MACarray2string(eeprom.sixBMAC);
// 	    sixBMAC.array = eeprom.sixBMAC;
// 	    eeprom.sixBMAC = sixBMAC;
//     }

//     data.sixbmac = eeprom.sixBMAC.string;
//     data.wwplatform = platform;
//     data.databasePort = databasePort;
//     data.sslCertsPath = sslPathDefault;
//     data.relayFirmwareVersionFile = relayFirmwareVersionFile;
//     data.factoryFirmwareVersionFile = factoryFirmwareVersionFile;
//     data.upgradeFirmwareVersionFile = upgradeFirmwareVersionFile;
//     data.userFirmwareVersionFile = userFirmwareVersionFile;
//     data.devicejsConfFile = devicejs_conf_file;
//     data.devicedbConfFile = devicedb_conf_file;
//     var _temps = null;
//     try {
//         _temps = execSync('fdisk -l ' + certsMemoryBlock + ' | xargs | awk \'{print $3}\'');
//     } catch (e) {
//         console.error("FAILED to run check for MMC", e);
//     }
//     if (_temps) {
//         if (Buffer.isBuffer(_temps)) _temps = _temps.toString();
//         data.partitionScheme = (_temps === '50\n') ? '8Gb' : '4Gb';
//     }
//     if (typeof eeprom.ledConfig !== 'undefined' &&
//         ((eeprom.ledConfig == '01') || (eeprom.ledConfig == '00') ||
//             (eeprom.ledConfig == '--') || (eeprom.ledConfig == 'xx'))) {
//         data.ledconfig = 'RGB';
//     } else {
//         data.ledconfig = 'RBG';
//     }
//     if (eeprom && eeprom.ledConfig)
//         data.ledConfig = data.ledconfig + '(' + eeprom.ledConfig.toString() + ')';
//     return data;
//}

function createHandlebarsDataForRSMI(eeprom) {
    var data = {};

    data.ARCH_HARDWARE_VERSION = eeprom.hardwareVersion;
    data.ARCH_RADIO_CONFIG = eeprom.radioConfig;

    return data;
}

function createHandlebarsRelayTerm(eeprom) {
    var data = {};
    data.ARCH_RELAY_SERVICES_HOST = eeprom.gatewayServicesAddress;
    data.SSL_CERTS_PATH = sslPathDefault;
    return data;
}

function createHandlebarsDevicejsConf(eeprom) {
    var data = {};

    data.ARCH_RELAY_SERVICES_HOST = eeprom.gatewayServicesAddress;
    data.LOCAL_DEVICEDB_PORT = databasePort;
    data.SSL_CERTS_PATH = sslPathDefault;

    return data;
}

function createHandlebarsDevicedbConf(eeprom) {
    var data = {};

    data.LOCAL_DEVICEDB_PORT = databasePort;
    data.ARCH_RELAY_SERVICES_HOST_RES = eeprom.gatewayServicesAddress.slice('https://'.length);
    data.ARCH_RELAY_SERVICES_HOST = eeprom.gatewayServicesAddress;
    data.SSL_CERTS_PATH = sslPathDefault;
    data.LOCAL_DATABASE_STORAGE_DIRECTORY = localDatabaseDirectory;

    return data;
}

function modify_devjs(MAC, TTY) {
    devjsconf.runtimeConfig.services.sixLBR.config.sixlbr.siodev = TTY;
    devjsconf.runtimeConfig.services.sixLBR.config.sixlbr.sixBMAC = MAC;
}

function get_all(callback) {
    var obj = {};
    first = true;
    var temp = [];
    for (var attr in reader.Layout) {
        temp.push(attr);
    }
    var res;
    read(temp, obj, function(done, err) {
        if (!!err) {
            console.error('Reading eeprom failed with error- ', err);
            callback(JSON.parse('{"eeprom":"not configured properly"}'));
            return;
        }
        if (!!done) {
            var res = done;
            res.relayID = res.BRAND + res.DEVICE + res.UUID;
            cloudURL = res.cloudURL = res.cloudURL.replace(/[^a-zA-Z0-9-!$%^&*()_+|~=`{}\[\]:";'<>?,.\/]/g, '') || cloudURL;
            cloudDevicejsURL = res.devicejsCloudURL = res.devicejsCloudURL.replace(/[^a-zA-Z0-9-!$%^&*()_+|~=`{}\[\]:";'<>?,.\/]/g, '') || cloudDevicejsURL;
            cloudDdbURL = res.devicedbCloudURL = res.devicedbCloudURL.replace(/[^a-zA-Z0-9-!$%^&*()_+|~=`{}\[\]:";'<>?,.\/]/g, '') || cloudDdbURL;
            callback(res);
        } else {
            callback(JSON.parse('{"eeprom":"not configured properly"}'));
            return;
        }
    });
}

function write_JSON2file(myfile, json, overwrite, cb) {
    console.log("writing: %s", myfile);
    fs.exists(myfile, function(exists) {
        if (exists && overwrite || (!exists)) {
            fs.writeFile(myfile, JSON.stringify(json, null, '\t') + "\n", 'utf8', function(err) {
                if (err) {
                    cb(err, null);
                } else {
                    cb(null, "SUCCESS");
                }
            });
        } else {
            console.log('NOTE: file ' + myfile + ' exists and overwrite false');
            cb(null, "SUCCESS");
        }
    });
}

function write_string2file(myfile, str, overwrite, cb) {
    console.log("writing: %s", myfile);
    fs.exists(myfile, function(exists) {
        if (exists && overwrite || (!exists)) {
            fs.writeFile(myfile, str, 'utf8', function(err) {
                if (err) {
                    cb(err, null);
                } else {
                    cb(null, "SUCCESS");
                }
            });
        } else cb(null, "SUCCESS");
    });
}

function MACarray2string(mray) {
    var finalstring = "";
    var temps = "";
    for (var i = 0; i < mray.length; i++) {
        temps = mray[i].toString(16);
        if (temps.length == 1) finalstring += "0";
        finalstring += temps;
    }
    return finalstring;
}

function eeprom2relay(uuid_eeprom, callback) {
    var R = {};
    var ethernetMAC = {};
    var sixBMAC = {};
    var CI = require(uuid_eeprom);

    R = CI;
    cloudURL = R.cloudURL = CI.cloudURL || cloudURL;
    if(CI.ethernetMAC) {
        ethernetMAC.string = MACarray2string(CI.ethernetMAC);
        ethernetMAC.array = CI.ethernetMAC;
        R.ethernetMAC = ethernetMAC;
    }
    if(CI.sixBMAC) {
        if(typeof CI.sixBMAC === 'undefined') { //Generate sixBMAC from ethernet MAC by inserting 0,1 in middle 
        	CI.sixBMAC = JSON.parse(JSON.stringify(ethernetMAC.array));
        	CI.sixBMAC.splice(3, 0, 0);
        	CI.sixBMAC.splice(4, 0, 1);
        }
        sixBMAC.string = MACarray2string(CI.sixBMAC);
        sixBMAC.array = CI.sixBMAC;
        R.sixBMAC = sixBMAC;
    }
    callback(null, R);
}

function read_sw_eeprom(callback) {
    var uuid = execSync.exec('dmidecode -s system-uuid');
    var uuid_eeprom = uuid_eeprom_path + uuid.stdout.toString().trim() + ".json";
    fs.exists(uuid_eeprom, function(exists) {
        if (!exists) { //read eeprom.json and build the uuid eeprom, then delete the eeprom.json
            fs.rename(eeprom_dot_json, uuid_eeprom, function(err, suc) {
                if (err) {
                    console.log("Error: %s OR %s does not exist.  Is this a new virtual_relay or a clonded virtual relay? Request a eeprom.json from \"Walt\"--> to be replaced with http://developer.wigwag.com or whatever", uuid_eeprom, eeprom_dot_json);
                    callback("no_eeprom", null);
                } else {
                    eeprom2relay(uuid_eeprom, callback);
                }
            });
        } else {
            eeprom2relay(uuid_eeprom, callback);
        }

    });
}

function setupLEDGPIOs() {
    return new Promise(function(resolve, reject) {
        exec('echo 37 > /sys/class/gpio/export', function(error, stdout, stderr) {
            try {
                execSync('echo out > /sys/class/gpio/gpio37/direction');
                exec('echo 38 > /sys/class/gpio/export', function(error, stdout, stderr) {
                    execSync('echo out > /sys/class/gpio/gpio38/direction');
                    console.log('setupLEDGPIOs successful');
                    resolve();
                });
            } catch (err) {
                console.error('setupLEDGPIOs failed: ', err);
                reject(err);
            }

        });
    });
}

function enableRTC() {
    return new Promise(function(resolve, reject) {
        var i2c = require('i2c');
        var i2cbus = '/dev/i2c-0';
        //the PMU AXP that is used on the relay can charge the RTC battery.  In order to successfully do so, we need to tell the PMU to charge at a voltage of 2.97.  This is enabled by writing an 0x82 into the data address 0x35, of the AXP Chip (@ address 0x35) on the i2c-0 bus.
        var chipaddress = 0x34;
        var recharge_register = 0x35;
        var recharge_data = 0x82; //decimal = 130;
        var cpuvoltage_register = 0x23;
        var cpu_data = 0x14;

        PMU = new i2c(chipaddress, {
            device: i2cbus
        });

        PMU.readBytes(recharge_register, 1, function(err, res) {
            if (err) {
                console.log("Error: %s", err);
                resolve(err);
            }
            if (res.readUInt8(0) != recharge_data) {
                console.log("Currently set to: 0x%s.  Setting to 0x82", res.readUInt8(0).toString(16));
                PMU.writeBytes(recharge_register, [recharge_data], function(err) {
                    if (err) console.log("Error: %s", err);
                });
            } else {
                console.log("RTC battery is charging: we are currently set to 0x%s", res.readUInt8(0).toString(16));
            }
            resolve();
        });
    });

}

function writeSecurity() {
    return new Promise(function(resolve, reject) {
        diskprom = new DiskStorage(certsMemoryBlock, certsMountPoint, certsSourcePoint);
        return diskprom.setup().then(function() {
            mkdirp.sync(sslPathDefault);
            console.log("Writing to SSL diskprom ");
            var DProm = [];
            DProm.push(diskprom.cpFile(ssl_client_key, sslPathDefault + '/' + ssl_client_key, POM));
            DProm.push(diskprom.cpFile(ssl_client_cert, sslPathDefault + '/' + ssl_client_cert, POM));
            DProm.push(diskprom.cpFile(ssl_server_key, sslPathDefault + '/' + ssl_server_key, POM));
            DProm.push(diskprom.cpFile(ssl_server_cert, sslPathDefault + '/' + ssl_server_cert, POM));
            DProm.push(diskprom.cpFile(ssl_ca_cert, sslPathDefault + '/' + ssl_ca_cert, POM));
            DProm.push(diskprom.cpFile(ssl_ca_int, sslPathDefault + '/' + ssl_ca_int, POM));
            Promise.all(DProm).then(function(result) {
                diskprom.disconnect();
                console.log("Successfully wrote certs to " + sslPathDefault);

                var caCert = fs.readFileSync(sslPathDefault + '/' + ssl_ca_cert, 'utf8');
                var caInt = fs.readFileSync(sslPathDefault + '/' + ssl_ca_int, 'utf8');
                fs.writeFile(sslPathDefault + '/' + ssl_ca_chain, caCert, function(err) {
                    if (err) {
                        console.error('Writing ca cert to chain file failed ', err);
                        reject(err);
                    } else {
                        fs.appendFile(sslPathDefault + '/' + ssl_ca_chain, caInt, function(err) {
                            if (err) {
                                console.error('Writing ca intermediate cert to chain file failed ', err);
                                reject(err);
                            } else {
                                console.log('Successfully generated ca chain file');
                                resolve();
                            }
                        });
                    }
                });
            }).catch(function(error) {
                diskprom.disconnect();
                console.log("debug", "get sslclientkey errored: " + error);
                reject(error);
            });
        });
    });
}

function generateSSL(ssl) {
    var self = this;
    return new Promise(function(resolve, reject) {
        console.log("Writing to SSL diskprom ");
        mkdirp.sync(sslPathDefault);
        try {
            fs.writeFileSync(sslPathDefault + '/' + ssl_server_cert, ssl.server.certificate, "utf8");
            fs.writeFileSync(sslPathDefault + '/' + ssl_client_cert, ssl.client.certificate, "utf8");
            fs.writeFileSync(sslPathDefault + '/' + ssl_server_key, ssl.server.key, "utf8");
            fs.writeFileSync(sslPathDefault + '/' + ssl_client_key, ssl.client.key, "utf8");
            fs.writeFileSync(sslPathDefault + '/' + ssl_ca_cert, ssl.ca.ca, "utf8");
            fs.writeFileSync(sslPathDefault + '/' + ssl_ca_int, ssl.ca.intermediate, "utf8");
            fs.writeFileSync(sslPathDefault + '/' + ssl_ca_chain, ssl.ca.ca, 'utf8');
            fs.appendFile(sslPathDefault + '/' + ssl_ca_chain, ssl.ca.intermediate, function(err) {
                if (err) {
                    console.error('Writing ca intermediate cert to chain file failed ', err);
                    reject(err);
                } else {
                    console.log('Successfully wrote all the certs');
                    resolve();
                }
            });
        } catch (e) {
            console.error('Generating certs failed ', e);
            reject('Generating certs faile ' + e);
        }
    });
}

function generateDevicejsConf(eeprom) {
    return new Promise(function(resolve, reject) {
        if (devicejs_conf_file) {
            var deviceConfHandlebars = handleBars.compile(JSON.stringify(templateDevicejsConf));
            var deviceConfData = createHandlebarsDevicejsConf(eeprom);
            var deviceConf = JSON.parse(deviceConfHandlebars(deviceConfData));

            write_JSON2file(devicejs_conf_file, deviceConf, overwrite_conf, function(err, suc) {
                if (err) {
                    console.error("Error Writing file ", devicejs_conf_file, err);
                    reject(err);
                } else {
                    console.log(suc + ': wrote ' + devicejs_conf_file + ' file successfully');
                    resolve();
                }
            });
        } else {
            reject(new Error('Please specify the devicejs config file path, got- ' + JSON.stringify(devicejs_conf_file)));
        }
    });
}

function generateDevicedbConf(eeprom) {
    return new Promise(function(resolve, reject) {
        if (devicedb_conf_file) {
            var deviceConfHandlebars = handleBars.compile(templateDevicedbConf);
            var deviceConfData = createHandlebarsDevicedbConf(eeprom);
            var deviceConf = deviceConfHandlebars(deviceConfData);

            write_string2file(devicedb_conf_file, deviceConf, overwrite_conf, function(err, suc) {
                if (err) {
                    console.error("Error Writing file ", devicedb_conf_file, err);
                    reject(err);
                } else {
                    console.log(suc + ': wrote ' + devicedb_conf_file + ' file successfully');
                    resolve();
                }
            });
        } else {
            reject(new Error('Please specify the devicedb config file path, got- ' + JSON.stringify(devicedb_conf_file)));
        }
    });
}

// function generateRelayConf(eeprom, platform) {
//     return new Promise(function(resolve, reject) {
//         //replace the handlebars
//         var template = handleBars.compile(JSON.stringify(devjsconf));
//         var data = createHandlebarsData(eeprom, platform + eeprom.hardwareVersion.toString());
//         var conf = JSON.parse(template(data));

//         write_JSON2file(relay_conf_json_file, conf, overwrite_conf, function(err, suc) {
//             if (err) {
//                 console.error("Error Writing file ", relay_conf_json_file, err);
//                 reject(err);
//             } else {
//                 console.log(suc + ': wrote ' + relay_conf_json_file + ' file successfully');
//                 resolve();
//             }
//         });
//     });
// }

function generateRelayTermConf(eeprom, platform) {
    return new Promise(function(resolve, reject) {
        //replace the handlebars
        var template = handleBars.compile(JSON.stringify(relaytermConf));
        var data = createHandlebarsRelayTerm(eeprom, platform + eeprom.hardwareVersion.toString());
        var conf = JSON.parse(template(data));

        write_JSON2file(relayterm_conf_json_file, conf, overwrite_conf, function(err, suc) {
            if (err) {
                console.error("Error Writing file ", relayterm_conf_json_file, err);
                reject(err);
            } else {
                console.log(suc + ': wrote ' + relayterm_conf_json_file + ' file successfully');
                resolve();
            }
        });
    });
}

function generateHardwareConf(eeprom) {
    return new Promise(function(resolve, reject) {
        write_JSON2file(hardware_conf, eeprom, overwrite_conf, function(err, suc) {
            if (err) {
                console.error("Error Writing file ", hardware_conf, err);
                reject(err);
            } else {
                console.log(suc + ': wrote ' + hardware_conf + ' file successfully');
                resolve();
            }
        });
    });

}

function generateRadioProfileConf(eeprom) {
    return new Promise(function(resolve, reject) {
        var radioConfTemplate = handleBars.compile(JSON.stringify(radioModuleConf));
        var radioData = createHandlebarsDataForRSMI(eeprom);
        var radioConf = JSON.parse(radioConfTemplate(radioData));

        write_JSON2file(rsmi_conf_json_file, radioConf, overwrite_conf, function(err, suc) {
            if (err) {
                console.error("Error Writing file ", rsmi_conf_json_file, err);
                reject(err);
            } else {
                console.log(suc + ': wrote ' + rsmi_conf_json_file + ' file successfully');
                resolve();
            }
        });
    });

}

//main fuction, first determines if we are on purpose based hardware (currently only detects WigWag Relays), or software.   It does this by detecting the EEprom type @ a specific location.
function main() {
    return new Promise(function(resolve, reject) {

        reader.exists(function(the_eeprom_exists) {
            if (the_eeprom_exists) {
                console.log("*** Hardware based Relay found ***");
                //	if (!exists) {
                get_all(function(result) {
                    //this checks if the eeprom had valid data.  I may want to add a different check, perhaps a eeprom_version number, so this file never need to change
                    console.log('Read EEPROM- ' + JSON.stringify(result));
                    if (typeof result.BRAND === 'undefined') {
                        reject(new Error('No relay ID found, please re-configure EEPROM'));
                        return;
                    }

                    // if (result.BRAND == "WW" || result.BRAND == "WD") {
                        // hw = define_hardware(result);
                        // result.hardware = hw;

                        var p = [];

                        p.push(writeSecurity());
                        p.push(generateDevicedbConf(result));
                        p.push(generateDevicejsConf(result));
                        // p.push(generateRelayConf(result, "wwgateway_v"));
                        p.push(generateRelayTermConf(result));
                        p.push(generateHardwareConf(result));

                        if (radioProfile_template_conf_file) {
                            p.push(generateRadioProfileConf(result));
                        }

                        Promise.all(p).then(function(result) {
                            console.log('EEPROM reader successful');
                            resolve();
                        }, function(err) {
                            reject(err);
                        });
                    // } else {
                    //     console.log("EEPROM is not configured properly.");
                    //     reject(new Error('EEPROM is not configured properly.'));
                    //     return;
                    // }
                });
            } else { //eprom doesn't exist... must do other things.  Assume the relay.conf just exists in desired form
                console.log("*** Software based Relay found ***");
                softwareBasedRelay = true;

                eeprom2relay(sw_eeprom_file, function(err, result) {
                    if (result) {
                        var p = [];

                        p.push(generateSSL(result.ssl));
                        p.push(generateDevicedbConf(result));
                        p.push(generateDevicejsConf(result));
                        // p.push(generateRelayConf(result, "softrelay"));
                        p.push(generateRelayTermConf(result));
                        p.push(generateHardwareConf(result));

                        if (radioProfile_template_conf_file) {
                            p.push(generateRadioProfileConf(result));
                        }

                        Promise.all(p).then(function(result) {
                            console.log('EEPROM reader successful');
                            resolve();
                        }, function(err) {
                            reject(err);
                        });
                    }
                });
            }
        });
    });
}

//Used in rp200 and higher versions
function read_at24c256() {
	console.log('Reading EEPROM...');
	return new Promise(function(resolve, reject) {
		var readEeprom = fs.readFileSync(at24c256EepromFilePath, 'utf8');
		// console.log('Read- ', readEeprom);
		try {
			readEeprom = JSON.parse(readEeprom);
		} catch(err) {
			console.error('Failed to parse ', err);
			reject(err);
			return;
		}
		resolve(readEeprom);
	});
}

function parseReadEeprom(ee) {
	try {
	    var ethernetMAC = {};
	    var sixBMAC = {};
        if(ee.ethernetMAC) {
    	    ethernetMAC.string = MACarray2string(ee.ethernetMAC);
    	    ethernetMAC.array = ee.ethernetMAC;
    	    if(typeof ee.sixBMAC === 'undefined') { //Generate sixBMAC from ethernet MAC by inserting 0,1 in middle 
    	    	ee.sixBMAC = JSON.parse(JSON.stringify(ethernetMAC.array));
    	    	ee.sixBMAC.splice(3, 0, 0);
    	    	ee.sixBMAC.splice(4, 0, 1);
    	    }
    	    sixBMAC.string = MACarray2string(ee.sixBMAC);
    	    sixBMAC.array = ee.sixBMAC;
    	    ee.ethernetMAC = ethernetMAC;
    	    ee.sixBMAC = sixBMAC;
        }

	    cloudURL = ee.cloudAddress = ee.cloudAddress || cloudURL;
	} catch(err) {
		console.log('Failed to parseReadEeprom ', err);
		if(err.stack) {
			console.log('Back trace ', err.stack);
		}
	}
    return ee;
}

function main_at24c256() {
    return new Promise(function(resolve, reject) {

    	read_at24c256().then(function(result) {
    		result = parseReadEeprom(result);
            //this checks if the eeprom had valid data.  I may want to add a different check, perhaps a eeprom_version number, so this file never need to change
            console.log('Read EEPROM- ' + JSON.stringify(result));

            try {
	            // hw = define_hardware(result);
	            // result.hardware = hw;

	            var p = [];

	            p.push(generateSSL(result.ssl));
	            p.push(generateDevicedbConf(result));
	            p.push(generateDevicejsConf(result));
	            // p.push(generateRelayConf(result, "wwgateway_v"));
	            p.push(generateRelayTermConf(result));
	            p.push(generateHardwareConf(result));

	            if (radioProfile_template_conf_file) {
	                p.push(generateRadioProfileConf(result));
	            }

	            Promise.all(p).then(function(result) {
	                console.log('EEPROM reader successful');
	                resolve();
	            }, function(err) {
	                reject(err);
	            });
	        } catch(e) {
	        	console.error("Failed to generate ", e , e.stack);
	        	reject(e);
	        }
    	}, function(err) {
    		reject(err);
    	});
    });
}

program
    .version('0.0.1')
    .option('-c, --config [filepath]', 'Specify relay_eeprom setup file')
    .parse(process.argv);

program.on('--help', function() {
    console.log(' Examples:');
    console.log("");
    console.log("  $ node ww_eeprom_reader -c relaySetup.json");
});

if (program.config) {
    try {
        relaySetupFile = JSON.parse(jsonminify(fs.readFileSync(program.config, 'utf8')));

        program.cloudURL = relaySetupFile.cloudURL || "https://cloud1.wigwag.com";
        program.cloudDevicejsURL = relaySetupFile.devicejsCloudURL || "https://devicejs1.wigwag.com";
        program.cloudDdbURL = relaySetupFile.devicedbCloudURL || "https://devicedb1.wigwag.com";
        program.templateFile = relaySetupFile.relayTemplateFilePath;
        program.relayConfFile = relaySetupFile.relayConfigFilePath;
        program.relaytermtemplateFile = relaySetupFile.relaytermTemplateFilePath;
        program.relaytermConfFile = relaySetupFile.relaytermConfigFilePath;
        program.radioProfiletemplateFile = relaySetupFile.rsmiTemplateFilePath;
        program.rsmiConfFile = relaySetupFile.rsmiConfigFilePath;
        program.devicejsConfTemplateFile = relaySetupFile.devicejsTemplateFilePath;
        program.devicejsConfFile = relaySetupFile.devicejsConfigFilePath;
        program.devicedbConfTemplateFile = relaySetupFile.devicedbTemplateFilePath;
        program.devicedbConfFile = relaySetupFile.devicedbConfigFilePath;
        program.databasePort = relaySetupFile.devicedbLocalPort || 9000;
        program.eepromFile = relaySetupFile.eepromFile;
        program.overwriteSSL = (relaySetupFile.overwriteSSL || false) ? 'overwrite' : 'dontoverwrite';
        program.overwrite = relaySetupFile.overwriteConfig || false;
        program.certsMemoryBlock = certsMemoryBlock_fixed;
        program.certsMountPoint = relaySetupFile.certsMountPoint;
        program.certsSourcePoint = relaySetupFile.certsSourcePoint;
        program.certsOutputDirectory = relaySetupFile.certsOutputDirectory;
        program.localDatabaseDirectory = relaySetupFile.localDatabaseDirectory || "/userdata/etc/devicejs/db";
        program.relayFirmwareVersionFile = relaySetupFile.relayFirmwareVersionFile || "/wigwag/etc/versions.json";

        console.log('Using program options ' + JSON.stringify(program));
    } catch (e) {
        console.error('Unable to read relay_eeprom setup file ', e);
        process.exit(1);
    }
} else {
    console.error('Please specify relay setup file, usage: node ww_eeprom_reader -c relaySetup.json');
    process.exit(1);
}

if (program.cloudURL) {
    cloudURL = program.cloudURL;
    console.log('Using cloud URL- ', cloudURL);
}

if (program.eepromFile) {
    sw_eeprom_file = program.eepromFile;
    console.log('Using eepromFile- ', sw_eeprom_file);
}

// if (program.templateFile) {
//     template_conf_file = program.templateFile;
//     console.log('Using templateFile- ', template_conf_file);
//     try {
//         devjsconf = JSON.parse(jsonminify(fs.readFileSync(template_conf_file, 'utf8')));
//     } catch (e) {
//         console.error('Could not open template file', e);
//         process.exit(1);
//     }

    // if (program.relayConfFile) {
    //     relay_conf_json_file = program.relayConfFile;
    //     console.log('Using relayConfFile- ', relay_conf_json_file);
    // } else {
    //     console.error('Please specify the relay.config.json file path');
    //     process.exit(1);
    // }

    if (program.relaytermtemplateFile) {
        relayterm_template_conf_file = program.relaytermtemplateFile;
        console.log('Using relayterm  templateFile- ', relayterm_template_conf_file);
        try {
            relaytermConf = JSON.parse(jsonminify(fs.readFileSync(relayterm_template_conf_file, 'utf8')));
        } catch (e) {
            console.error('Could not open relayterm template file', e);
            process.exit(1);
        }

        if (program.relaytermConfFile) {
            relayterm_conf_json_file = program.relaytermConfFile;
            console.log('Using relaytermConfFile- ', relayterm_conf_json_file);
        } else {
            console.error('Please specify the relayterm config.json file path');
            process.exit(1);
        }
    } else {
        console.error('Please specify relayterm template file');
        process.exit(1);
    }

    if (program.radioProfiletemplateFile) {
        radioProfile_template_conf_file = program.radioProfiletemplateFile;
        console.log('Using radio profile templateFile- ', radioProfile_template_conf_file);
        try {
            radioModuleConf = JSON.parse(jsonminify(fs.readFileSync(radioProfile_template_conf_file, 'utf8')));
        } catch (e) {
            console.error('Could not open radio profile template file', e);
            process.exit(1);
        }

        if (program.rsmiConfFile) {
            rsmi_conf_json_file = program.rsmiConfFile;
            console.log('Using rsmiConfFile- ', rsmi_conf_json_file);
        } else {
            console.error('Please specify the radioProfile.config.json file path');
            process.exit(1);
        }
    } else {
        console.error('Please specify radio profile template file');
        process.exit(1);
    }
// } else {
//     console.error('Please specify relay template file');
//     process.exit(1);
// }

if (program.overwrite) {
    overwrite_conf = program.overwrite === true;
    console.log('Using overwrite- ', overwrite_conf);
}
if (program.overwriteSSL) {
    POM = program.overwriteSSL;
    console.log('Using overwriteSSL- ', POM);
}

if (program.devicejsConfFile && program.devicejsConfTemplateFile) {
    console.log('Got to generate devicejs conf file for devicejs2.0');
    console.log('Using devicejs conf template- ', program.devicejsConfTemplateFile);
    console.log('Using devicejs conf output file- ', program.devicejsConfFile);
    devicejs_conf_file = program.devicejsConfFile;
    templateDevicejsConf = JSON.parse(jsonminify(fs.readFileSync(program.devicejsConfTemplateFile, 'utf8')));

    if (program.cloudDevicejsURL && program.cloudDdbURL) {
        console.log('Using cloud devicejs url- ' + program.cloudDevicejsURL + ' , using cloud database url- ' + program.cloudDdbURL);
        cloudDevicejsURL = program.cloudDevicejsURL;
        cloudDdbURL = program.cloudDdbURL;
    } else {
        console.error('Please specify urls for cloud database and devicejs');
        process.exit(1);
    }
} else {
    console.warn('Not generating devicejs config file as command line options are not provided');
}

if (program.devicedbConfFile && program.devicedbConfTemplateFile) {
    console.log('Got to generate devicedb conf file for ddb go');
    console.log('Using devicedb conf template- ', program.devicedbConfTemplateFile);
    console.log('Using devicedb conf output file- ', program.devicedbConfFile);
    devicedb_conf_file = program.devicedbConfFile;
    templateDevicedbConf = fs.readFileSync(program.devicedbConfTemplateFile, 'utf8');
} else {
    console.warn('Not generating deviced config file as command line options are not provided');
}

if (program.databasePort) {
    console.log('Got database port ', program.databasePort);
    databasePort = program.databasePort;
} else {
    console.warn('Database port is not specified');
}

if (typeof program.certsMountPoint !== 'undefined') {
    certsMountPoint = program.certsMountPoint;
} else {
    console.warn('Certs mount point is not defined using ', certsMountPoint);
}

if (typeof program.certsMemoryBlock !== 'undefined') {
    certsMemoryBlock = program.certsMemoryBlock;
} else {
    console.warn('Certs memory block is not defined using ', certsMemoryBlock);
}

if (typeof program.certsSourcePoint !== 'undefined') {
    certsSourcePoint = program.certsSourcePoint;
} else {
    console.warn('Certs source point is not defined using ', certsSourcePoint);
}

if (typeof program.certsOutputDirectory !== 'undefined') {
    certsOutputDirectory = program.certsOutputDirectory;
    sslPathDefault = certsOutputDirectory;
} else {
    console.warn('Certs output point is not defined using ', certsOutputDirectory);
}

if (typeof program.localDatabaseDirectory !== 'undefined') {
    localDatabaseDirectory = program.localDatabaseDirectory;
} else {
    console.warn('Using default local database directory ', localDatabaseDirectory);
}

if (typeof program.relayFirmwareVersionFile !== 'undefined') {
    relayFirmwareVersionFile = program.relayFirmwareVersionFile;
} else {
    console.warn('Using default relay firmware version file ', relayFirmwareVersionFile);
}
if(fs.existsSync(at24c256EepromFilePath)) {
	main_at24c256().then(function() {
		console.log('EEPROM read successfully!');
	}, function(err) {
		console.error('Failed ', err);
		process.exit(1);
	}).catch(function(error) {
		console.error("EEPROM reader failed- ", err);
		if(err.stack) {
			console.error('Back trace: ', err.stack);
		}
		process.exit(1);
	});
} else {
	main().then(function() {
	    if (!softwareBasedRelay) {
	        setupLEDGPIOs().then(function() {
	            enableRTC();
	        });
	    }
	}, function(err) {
	    console.error('EEPROM reader got error- ', err);
	    if (err.stack) {
	        console.error('Back trace:', err.stack);
	    }
	    process.exit(1);
	});
}